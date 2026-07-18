import { httpClient, IntegrationRequestError, type HttpClient } from '@/integrations/http';
import type { GitHubRepository, GitHubRepositoryCatalog, PullRequestItem, ReviewState } from '@/types/dashboard';

interface GitHubClientOptions {
	token: string;
	repositories: string[];
	windowDays?: number;
	httpClient?: HttpClient;
	now?: Date;
}

interface RawRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	archived: boolean;
	owner: { login: string; type: 'User' | 'Organization' };
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
	reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'COMMENTED' | null;
	repository: { nameWithOwner: string };
	labels: { nodes: Array<{ name: string }> };
}

interface SearchResponse {
	data?: {
		search?: {
			nodes: RawPullRequest[];
			pageInfo: { endCursor: string | null; hasNextPage: boolean };
		};
	};
	errors?: Array<{ message: string }>;
}

const GITHUB_HEADERS = {
	'Accept': 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
};

const INVOLVEMENT_QUALIFIERS = ['author', 'review-requested', 'reviewed-by'] as const;

export async function discoverGitHubRepositories(token: string, client: HttpClient = httpClient): Promise<GitHubRepositoryCatalog> {
	const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
	const viewer = await client.get<{ login: string }>('https://api.github.com/user', {
		headers,
		provider: 'github',
	});

	const repositories: GitHubRepository[] = [];
	for (let page = 1; ; page++) {
		const result = await client.get<RawRepository[]>(`https://api.github.com/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&visibility=all&sort=full_name&direction=asc&per_page=100&page=${page}`, {
			headers,
			provider: 'github',
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

	return {
		viewerLogin: viewer.login,
		repositories,
		defaultScopes: [`${viewer.login}/*`],
	};
}

export function createGitHubClient(options: GitHubClientOptions) {
	const { token, repositories: configuredScopes, windowDays = 7, now = new Date() } = options;
	const client = options.httpClient ?? httpClient;

	async function fetchPullRequests(): Promise<{ items: PullRequestItem[]; unconfigured: boolean }> {
		if (!token) return { items: [], unconfigured: true };

		const catalog = await discoverGitHubRepositories(token, client);
		const scopes = configuredScopes.length > 0 ? configuredScopes : catalog.defaultScopes;
		const selectedRepositories = expandRepositoryScopes(scopes, catalog.repositories);
		if (selectedRepositories.length === 0) return { items: [], unconfigured: false };

		const boundedWindowDays = Math.max(1, Math.min(30, Math.trunc(windowDays)));
		const cutoff = new Date(now.getTime() - boundedWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const items = new Map<string, PullRequestItem>();

		for (const repositoryChunk of chunkRepositoriesForSearch(selectedRepositories, catalog.viewerLogin, cutoff)) {
			await Promise.all(INVOLVEMENT_QUALIFIERS.map(async involvement => {
				let cursor: string | null = null;
				let hasNextPage = true;

				while (hasNextPage) {
					const query = buildSearchQuery(catalog.viewerLogin, cutoff, repositoryChunk, involvement);
					const response: SearchResponse = await client.post<SearchResponse>('https://api.github.com/graphql', {
						headers: {
							...GITHUB_HEADERS,
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ query: buildSearchGraphQLQuery(), variables: { query, cursor } }),
						provider: 'github',
					});

					if (response.errors?.length) {
						throw new IntegrationRequestError('GitHub GraphQL error', 'github', null, null);
					}

					const search: NonNullable<SearchResponse['data']>['search'] = response.data?.search;
					if (!search) break;
					for (const pullRequest of search.nodes) {
						if (pullRequest.__typename !== 'PullRequest') continue;
						items.set(pullRequest.id, normalizePullRequest(pullRequest));
					}

					hasNextPage = search.pageInfo.hasNextPage && !!search.pageInfo.endCursor;
					cursor = search.pageInfo.endCursor;
				}
			}));
		}

		return {
			items: Array.from(items.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
			unconfigured: false,
		};
	}

	return { fetchPullRequests };
}

function expandRepositoryScopes(scopes: string[], repositories: GitHubRepository[]): string[] {
	const selected = new Set<string>();
	for (const scope of scopes) {
		if (scope.endsWith('/*')) {
			const owner = scope.slice(0, -2).toLowerCase();
			for (const repository of repositories) {
				if (repository.owner.toLowerCase() === owner) selected.add(repository.fullName);
			}
		} else if (repositories.some(repository => repository.fullName.toLowerCase() === scope.toLowerCase())) {
			selected.add(repositories.find(repository => repository.fullName.toLowerCase() === scope.toLowerCase())!.fullName);
		}
	}
	return Array.from(selected).sort((a, b) => a.localeCompare(b));
}

function buildSearchQuery(
	viewer: string,
	cutoff: string,
	repositories: string[],
	involvement: typeof INVOLVEMENT_QUALIFIERS[number]
): string {
	const repositoryScope = repositories.map(repository => `repo:${repository}`).join(' ');
	return `is:pr updated:>=${cutoff} ${involvement}:${viewer} ${repositoryScope}`;
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
					reviewDecision
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

	let reviewState: ReviewState;
	if (pullRequest.isDraft) reviewState = 'draft';
	else if (pullRequest.reviewDecision === 'APPROVED') reviewState = 'approved';
	else if (pullRequest.reviewDecision === 'CHANGES_REQUESTED') reviewState = 'changes_requested';
	else reviewState = 'review_required';

	return {
		id: pullRequest.id,
		repository: pullRequest.repository.nameWithOwner,
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author?.login ?? 'Unknown',
		reviewState,
		state,
		createdAt: pullRequest.createdAt,
		updatedAt: pullRequest.updatedAt,
		url: pullRequest.url,
		labels: pullRequest.labels.nodes.map(label => label.name).sort().slice(0, 20),
	};
}

function chunkRepositoriesForSearch(repositories: string[], viewer: string, cutoff: string): string[][] {
	const chunks: string[][] = [];
	let current: string[] = [];
	for (const repository of repositories) {
		const candidate = [...current, repository];
		if (current.length > 0 && buildSearchQuery(viewer, cutoff, candidate, 'review-requested').length > 240) {
			chunks.push(current);
			current = [repository];
		} else {
			current = candidate;
		}
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}
