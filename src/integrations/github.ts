import { requestJson, IntegrationRequestError } from '@/integrations/http';
import type { PullRequestItem, ReviewState } from '@/types/dashboard';

interface GitHubGraphQLResponse {
	data?: {
		repository?: {
			pullRequests: {
				nodes: RawPullRequest[];
				pageInfo: PageInfo;
				rateLimit: RateLimitInfo;
			};
		};
		rateLimit?: RateLimitInfo;
	};
	errors?: Array<{ message: string }>;
}

interface RawPullRequest {
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
	labels: {
		nodes: Array<{ name: string }>;
	};
}

interface PageInfo {
	endCursor: string | null;
	hasNextPage: boolean;
}

interface RateLimitInfo {
	remaining: number;
	resetAt: string;
}

interface GitHubClientOptions {
	token: string;
	repositories: string[];
	fetchImpl?: typeof fetch;
	now?: Date;
}

interface FetchResult {
	items: PullRequestItem[];
	rateLimit: RateLimitInfo | null;
}

export function createGitHubClient(options: GitHubClientOptions) {
	const { token, repositories, fetchImpl = fetch, now = new Date() } = options;

	const unconfigured = !token || repositories.length === 0;

	async function fetchPullRequests(): Promise<{ items: PullRequestItem[]; unconfigured: boolean }> {
		if (unconfigured) {
			return { items: [], unconfigured: true };
		}

		const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const cutoffIso = cutoffDate.toISOString();

		const results: PullRequestItem[] = [];
		let globalRateLimit: RateLimitInfo | null = null;

		const repositoryChunks = chunkArray(repositories, 4);

		for (const chunk of repositoryChunks) {
			const repoPromises = chunk.map(async (fullName) => {
				const [owner, repo] = fullName.split('/');
				if (!owner || !repo) {
					throw new Error(`Invalid repository format: ${fullName}`);
				}

				let cursor: string | null = null;
				let hasNextPage = true;
				let repoRateLimit: RateLimitInfo | null = null;

				while (hasNextPage) {
					const query = buildGraphQLQuery(cursor);
					const queryVars = { owner, repo, cursor };

					const gqlResponse: GitHubGraphQLResponse = await requestJson<GitHubGraphQLResponse>({
						url: 'https://api.github.com/graphql',
						method: 'POST',
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ query, variables: queryVars }),
						provider: 'github',
						fetchImpl,
					});

					if (gqlResponse.errors && gqlResponse.errors.length > 0) {
						throw new IntegrationRequestError(
							'GitHub GraphQL error',
							'github',
							null,
							null
						);
					}

					const repoData = gqlResponse.data?.repository;
					if (!repoData) {
						throw new IntegrationRequestError(
							'Repository not found',
							'github',
							404,
							null
						);
					}

					const pullRequests = repoData.pullRequests;

					if (pullRequests.rateLimit) {
						repoRateLimit = pullRequests.rateLimit;
						if (globalRateLimit === null || pullRequests.rateLimit.remaining < globalRateLimit.remaining) {
							globalRateLimit = pullRequests.rateLimit;
						}

						if (pullRequests.rateLimit.remaining === 0) {
							throw new IntegrationRequestError(
								`Rate limit resets at ${pullRequests.rateLimit.resetAt}`,
								'github',
								429,
								null
							);
						}
					}

					const prs = pullRequests.nodes;

					if (prs.length === 0) {
						hasNextPage = false;
						break;
					}

					const oldestInPage = prs[prs.length - 1].updatedAt;
					if (oldestInPage < cutoffIso) {
						const filteredPrs = prs.filter((pr: RawPullRequest) => pr.updatedAt >= cutoffIso);
						results.push(...filteredPrs.map((pr: RawPullRequest) => normalizePullRequest(pr, fullName)));
						hasNextPage = false;
						break;
					}

					results.push(...prs.map((pr: RawPullRequest) => normalizePullRequest(pr, fullName)));

					hasNextPage = pullRequests.pageInfo.hasNextPage;
					cursor = pullRequests.pageInfo.endCursor;
				}

				return { fullName, rateLimit: repoRateLimit };
			});

			const repoResults = await Promise.all(repoPromises);

			for (const result of repoResults) {
				if (result.rateLimit) {
					if (globalRateLimit === null || result.rateLimit.remaining < globalRateLimit.remaining) {
						globalRateLimit = result.rateLimit;
					}
				}
			}
		}

		results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

		return { items: results, unconfigured: false };
	}

	function normalizePullRequest(pr: RawPullRequest, repository: string): PullRequestItem {
		let state: 'open' | 'draft' | 'merged' | 'closed';
		if (pr.isDraft) {
			state = 'draft';
		} else if (pr.state === 'OPEN') {
			state = 'open';
		} else if (pr.state === 'MERGED' || pr.mergedAt !== null) {
			state = 'merged';
		} else {
			state = 'closed';
		}

		let reviewState: ReviewState;
		if (pr.isDraft) {
			reviewState = 'draft';
		} else if (pr.reviewDecision === 'APPROVED') {
			reviewState = 'approved';
		} else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
			reviewState = 'changes_requested';
		} else {
			reviewState = 'review_required';
		}

		const labels = pr.labels.nodes.map((l) => l.name).sort().slice(0, 20);

		return {
			id: pr.id,
			repository,
			number: pr.number,
			title: pr.title,
			author: pr.author?.login ?? 'Unknown',
			reviewState,
			state,
			createdAt: pr.createdAt,
			updatedAt: pr.updatedAt,
			url: pr.url,
			labels,
		};
	}

	return { fetchPullRequests };
}

function buildGraphQLQuery(cursor: string | null): string {
	return `query($owner: String!, $repo: String!, $cursor: String) {
		repository(owner: $owner, name: $repo) {
			pullRequests(first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
				nodes {
					id
					number
					title
					url
					createdAt
					updatedAt
					isDraft
					state
					mergedAt
					author {
						login
					}
					reviewDecision
					labels(first: 20) {
						nodes {
							name
						}
					}
				}
				pageInfo {
					endCursor
					hasNextPage
				}
				rateLimit {
					remaining
					resetAt
				}
			}
		}
		rateLimit {
			remaining
			resetAt
		}
	}`;
}

function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}
