import { createHttpClient, IntegrationRequestError } from '@/integrations/http';
import type { GitHubPullRequestContext, GitHubRepository, GitHubRepositoryCatalog, PullRequestItem } from '@/types/dashboard';

interface GitHubClientOptions {
	token: string;
	repositoryScopes: string[];
	windowDays: number;
	requestedAt: Date;
	pullRequestContext: GitHubPullRequestContext;
}

interface RawRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	archived: boolean;
	owner: { login: string; type: 'User' | 'Organization' };
}

interface RawTeam {
	slug: string;
	organization: { login: string };
}

interface RawOwner {
	login: string;
	type: 'User' | 'Organization';
}

interface RawPullRequest {
	__typename: 'PullRequest';
	id: string;
	number: number;
	title: string;
	url: string;
	createdAt: string;
	updatedAt: string;
	isDraft: boolean;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	mergedAt: string | null;
	author: { login: string } | null;
	repository: { nameWithOwner: string };
	labels: { nodes: Array<{ name: string }> };
}

interface SearchResponse {
	data?: {
		search?: {
			nodes: Array<RawPullRequest | null>;
			pageInfo: { endCursor: string | null; hasNextPage: boolean };
		};
	};
	errors?: Array<{ message: string }>;
}

const GITHUB_HEADERS = {
	'Accept': 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
};
const GITHUB_BASE_URL = 'https://api.github.com';

async function fetchGitHubTeams(client: ReturnType<typeof createHttpClient>, headers: Record<string, string>): Promise<string[]> {
	try {
		const teams: string[] = [];
		for (let page = 1; ; page++) {
			const result = await client.get<RawTeam[]>(`/user/teams?per_page=100&page=${page}`, { headers });
			teams.push(...result.map(team => `${team.organization.login}/${team.slug}`));
			if (result.length < 100) return Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b));
		}
	} catch (error) {
		if (error instanceof IntegrationRequestError && (error.status === 403 || error.status === 404)) return [];
		throw error;
	}
}

export async function discoverGitHubRepositories(token: string): Promise<GitHubRepositoryCatalog> {
	const client = createHttpClient(GITHUB_BASE_URL);
	const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
	const viewer = await client.get<{ login: string }>('/user', {
		headers,
	});

	const repositories: GitHubRepository[] = [];
	for (let page = 1; ; page++) {
		const result = await client.get<RawRepository[]>(`/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&visibility=all&sort=full_name&direction=asc&per_page=100&page=${page}`, {
			headers,
		});

		repositories.push(...result.map(repository => ({
			id: repository.id,
			name: repository.name,
			fullName: repository.full_name,
			owner: repository.owner.login,
			ownerType: repository.owner.type,
			private: repository.private,
			archived: repository.archived,
		})));

		if (result.length < 100) break;
	}
	const teams = await fetchGitHubTeams(client, headers);

	return {
		viewerLogin: viewer.login,
		repositories,
		defaultScopes: [`${viewer.login}/*`],
		teams: Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b)),
	};
}

export async function discoverGitHubPullRequestContext(token: string, repositoryScopes: string[]): Promise<GitHubPullRequestContext> {
	const client = createHttpClient(GITHUB_BASE_URL);
	const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
	const wildcardOwners = Array.from(new Set(repositoryScopes
		.filter(scope => scope.endsWith('/*'))
		.map(scope => scope.slice(0, -2).toLowerCase())));

	const [viewer, teams, owners] = await Promise.all([
		client.get<{ login: string }>('/user', { headers }),
		fetchGitHubTeams(client, headers),
		Promise.all(wildcardOwners.map(owner => client.get<RawOwner>(`/users/${encodeURIComponent(owner)}`, { headers }))),
	]);

	return {
		viewerLogin: viewer.login,
		teams,
		ownerTypes: Object.fromEntries(owners.map(owner => [owner.login.toLowerCase(), owner.type])),
	};
}

export function createGitHubClient(options: GitHubClientOptions) {
	const { token, repositoryScopes, windowDays, requestedAt, pullRequestContext } = options;
	const client = createHttpClient(GITHUB_BASE_URL);

	async function fetchPullRequests(): Promise<{ items: PullRequestItem[]; unconfigured: boolean }> {
		if (!token) return { items: [], unconfigured: true };

		const scopes = repositoryScopes.length > 0 ? repositoryScopes : [`${pullRequestContext.viewerLogin}/*`];
		const searchQualifiers = buildRepositorySearchQualifiers(scopes, pullRequestContext);
		if (searchQualifiers.length === 0) return { items: [], unconfigured: false };

		const boundedWindowDays = Math.max(1, Math.min(30, Math.trunc(windowDays)));
		const cutoff = new Date(requestedAt.getTime() - boundedWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const requestedDate = requestedAt.toISOString().slice(0, 10);
		const items = new Map<string, PullRequestItem>();
		const involvedIds = new Set<string>();

		async function searchPullRequests(query: string): Promise<RawPullRequest[]> {
			const pullRequests: RawPullRequest[] = [];
			let cursor: string | null = null;
			let hasNextPage = true;

			while (hasNextPage) {
				const response: SearchResponse = await client.post<SearchResponse>('/graphql', {
					headers: {
						...GITHUB_HEADERS,
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ query: buildSearchGraphQLQuery(), variables: { query, cursor } }),
				});

				if (response.errors?.length) {
					throw new IntegrationRequestError('GitHub GraphQL error', 'github', null, null);
				}

				const search: NonNullable<SearchResponse['data']>['search'] = response.data?.search;
				if (!search) break;
				pullRequests.push(...search.nodes.filter((pullRequest): pullRequest is RawPullRequest => pullRequest?.__typename === 'PullRequest'));

				hasNextPage = search.pageInfo.hasNextPage && !!search.pageInfo.endCursor;
				cursor = search.pageInfo.endCursor;
			}
			return pullRequests;
		}

		const results = await Promise.all(groupSearchQualifiers(searchQualifiers, cutoff, pullRequestContext).map(async repositoryGroup => {
			const [allPullRequestResults, involvementResults] = await Promise.all([
				Promise.all(buildPullRequestSearchQueries(cutoff, requestedDate, repositoryGroup).map(searchPullRequests)),
				Promise.all(buildInvolvementSearchQueries(cutoff, repositoryGroup, pullRequestContext).map(searchPullRequests)),
			]);
			return [allPullRequestResults.flat(), involvementResults.flat()] as const;
		}));
		for (const [allPullRequests, involvedPullRequests] of results) {
			for (const pullRequest of allPullRequests) items.set(pullRequest.id, normalizePullRequest(pullRequest));
			for (const pullRequest of involvedPullRequests) involvedIds.add(pullRequest.id);
		}

		return {
			items: Array.from(items.values())
				.map(item => ({ ...item, involved: involvedIds.has(item.id) }))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
			unconfigured: false,
		};
	}

	return { fetchPullRequests };
}

function buildRepositorySearchQualifiers(scopes: string[], context: GitHubPullRequestContext): string[] {
	const qualifiers = new Set<string>();
	for (const scope of scopes) {
		if (scope.endsWith('/*')) {
			const owner = scope.slice(0, -2);
			const ownerType = owner.toLowerCase() === context.viewerLogin.toLowerCase()
				? 'User'
				: context.ownerTypes[owner.toLowerCase()];
			if (ownerType) qualifiers.add(`${ownerType === 'Organization' ? 'org' : 'user'}:${owner}`);
		} else {
			qualifiers.add(`repo:${scope}`);
		}
	}
	return Array.from(qualifiers).sort((a, b) => a.localeCompare(b));
}

function buildSearchQuery(cutoff: string, qualifiers: string[]): string {
	return `is:pr updated:>=${cutoff} ${qualifiers.join(' ')}`;
}

function buildPullRequestSearchQueries(cutoff: string, requestedDate: string, qualifiers: string[]): string[] {
	const queries: string[] = [];
	const finalDate = new Date(`${requestedDate}T00:00:00.000Z`);
	let rangeStart = new Date(`${cutoff}T00:00:00.000Z`);

	while (rangeStart <= finalDate) {
		const rangeEnd = new Date(Math.min(rangeStart.getTime() + 24 * 60 * 60 * 1000, finalDate.getTime()));
		const start = rangeStart.toISOString().slice(0, 10);
		const end = rangeEnd.toISOString().slice(0, 10);
		const updatedRange = start === end ? start : `${start}..${end}`;
		queries.push(`is:pr updated:${updatedRange} ${qualifiers.join(' ')}`);
		rangeStart = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
	}

	return queries;
}

function buildInvolvementSearchQueries(cutoff: string, qualifiers: string[], context: GitHubPullRequestContext): string[] {
	const viewer = context.viewerLogin;
	const baseQuery = buildSearchQuery(cutoff, qualifiers);
	return [
		`${baseQuery} involves:${viewer}`,
		`${baseQuery} review-requested:${viewer}`,
		`${baseQuery} reviewed-by:${viewer}`,
		...context.teams.map(team => `${baseQuery} team-review-requested:${team}`),
	];
}

function buildSearchGraphQLQuery(): string {
	return `query($query: String!, $cursor: String) {
		search(query: $query, type: ISSUE, first: 100, after: $cursor) {
			nodes {
				__typename
				... on PullRequest {
					id
					number
					title
					url
					createdAt
					updatedAt
					isDraft
					state
					mergedAt
					author { login }
					repository { nameWithOwner }
					labels(first: 20) { nodes { name } }
				}
			}
			pageInfo { endCursor hasNextPage }
		}
	}`;
}

function normalizePullRequest(pullRequest: RawPullRequest): PullRequestItem {
	let state: PullRequestItem['state'];
	if (pullRequest.isDraft) state = 'draft';
	else if (pullRequest.state === 'OPEN') state = 'open';
	else if (pullRequest.state === 'MERGED' || pullRequest.mergedAt) state = 'merged';
	else state = 'closed';

	return {
		id: pullRequest.id,
		repository: pullRequest.repository.nameWithOwner,
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author?.login ?? 'Unknown',
		involved: false,
		state,
		createdAt: pullRequest.createdAt,
		updatedAt: pullRequest.updatedAt,
		url: pullRequest.url,
		labels: pullRequest.labels.nodes.map(label => label.name).sort().slice(0, 20),
	};
}

function groupSearchQualifiers(qualifiers: string[], cutoff: string, context: GitHubPullRequestContext): string[][] {
	const ownerGroups = qualifiers
		.filter(qualifier => !qualifier.startsWith('repo:'))
		.map(qualifier => [qualifier]);
	const repositoryChunks: string[][] = [];
	let current: string[] = [];
	for (const qualifier of qualifiers.filter(candidate => candidate.startsWith('repo:'))) {
		const candidate = [...current, qualifier];
		if (current.length > 0 && Math.max(...buildInvolvementSearchQueries(cutoff, candidate, context).map(query => query.length)) > 240) {
			repositoryChunks.push(current);
			current = [qualifier];
		} else {
			current = candidate;
		}
	}
	if (current.length > 0) repositoryChunks.push(current);
	return [...ownerGroups, ...repositoryChunks];
}
