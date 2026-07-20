import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient, discoverGitHubPullRequestContext, discoverGitHubRepositories } from '@/integrations/github';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function repository(id: number, fullName: string, ownerType: 'User' | 'Organization' = 'Organization') {
	const [owner, name] = fullName.split('/');
	return { id, name, full_name: fullName, private: true, archived: false, owner: { login: owner, type: ownerType } };
}

function pullRequestContext(viewerLogin = 'albert', teams: string[] = [], ownerTypes: Record<string, 'User' | 'Organization'> = {}) {
	return {
		viewerLogin,
		teams,
		ownerTypes,
	};
}

function pullRequest(overrides: Record<string, unknown> = {}) {
	return {
		__typename: 'PullRequest',
		id: 'PR_1',
		number: 12,
		title: 'Improve repository selection',
		url: 'https://github.com/acme/dashboard/pull/12',
		createdAt: '2026-07-16T10:00:00Z',
		updatedAt: '2026-07-18T09:00:00Z',
		isDraft: false,
		state: 'OPEN',
		mergedAt: null,
		author: { login: 'albert' },
		repository: { nameWithOwner: 'acme/dashboard' },
		labels: { nodes: [{ name: 'dashboard' }] },
		...overrides,
	};
}

function isInvolvementQuery(query: string): boolean {
	return query.includes('involves:') || query.includes('review-requested:') || query.includes('reviewed-by:') || query.includes('team-review-requested:');
}

describe('GitHub repository discovery', () => {
	it('paginates all repositories available to the authenticated user', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => repository(index, `acme/repo-${index}`));
		const mockTransport = vi.fn()
			.mockResolvedValueOnce(jsonResponse({ login: 'albert' }))
			.mockResolvedValueOnce(jsonResponse(firstPage))
			.mockResolvedValueOnce(jsonResponse([repository(101, 'albert/personal', 'User')]))
			.mockResolvedValueOnce(jsonResponse([{ slug: 'developers', organization: { login: 'acme' } }]));

		vi.stubGlobal('fetch', mockTransport);
		const result = await discoverGitHubRepositories('token');

		expect(result.viewerLogin).toBe('albert');
		expect(result.repositories).toHaveLength(101);
		expect(result.defaultScopes).toEqual(['albert/*']);
		expect(result.teams).toEqual(['acme/developers']);
		expect(String(mockTransport.mock.calls[1][0])).toContain('per_page=100&page=1');
		expect(String(mockTransport.mock.calls[2][0])).toContain('per_page=100&page=2');
	});

	it('keeps accessible repositories when team lookup is forbidden', async () => {
		const mockTransport = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([
				repository(1, 'mol-fe-site-api'),
				repository(2, 'mol-fe-feeds'),
			]);
			if (url.includes('/user/teams')) return jsonResponse({ message: 'Resource not accessible by personal access token' }, 403);
			throw new Error(`Unexpected GitHub request: ${url}`);
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await discoverGitHubRepositories('token');

		expect(result.repositories.map(item => item.fullName)).toEqual(['mol-fe-site-api', 'mol-fe-feeds']);
		expect(result.teams).toEqual([]);
	});

	it('loads lightweight dashboard context without enumerating repositories', async () => {
		const mockTransport = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/teams')) return jsonResponse([{ slug: 'developers', organization: { login: 'acme' } }]);
			throw new Error(`Unexpected GitHub request: ${url}`);
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await discoverGitHubPullRequestContext('token', ['acme/dashboard', 'acme/api']);

		expect(result).toEqual({ viewerLogin: 'albert', teams: ['acme/developers'], ownerTypes: {} });
		expect(mockTransport).toHaveBeenCalledTimes(2);
		expect(mockTransport.mock.calls.every(([input]) => !String(input).includes('/user/repos'))).toBe(true);
	});

	it('resolves only owners used by wildcard dashboard scopes', async () => {
		const mockTransport = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/teams')) return jsonResponse([]);
			if (url.endsWith('/users/acme')) return jsonResponse({ login: 'acme', type: 'Organization' });
			throw new Error(`Unexpected GitHub request: ${url}`);
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await discoverGitHubPullRequestContext('token', ['acme/*', 'albert/personal']);

		expect(result.ownerTypes).toEqual({ acme: 'Organization' });
		expect(mockTransport).toHaveBeenCalledTimes(3);
		expect(mockTransport.mock.calls.every(([input]) => !String(input).includes('/user/repos'))).toBe(true);
	});

	it('loads pull request context when team lookup is forbidden', async () => {
		const mockTransport = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/teams')) return jsonResponse({ message: 'Resource not accessible by personal access token' }, 403);
			if (url.endsWith('/users/dailymail')) return jsonResponse({ login: 'DailyMail', type: 'Organization' });
			throw new Error(`Unexpected GitHub request: ${url}`);
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await discoverGitHubPullRequestContext('token', ['DailyMail/*']);

		expect(result).toEqual({ viewerLogin: 'albert', teams: [], ownerTypes: { dailymail: 'Organization' } });
	});
});

describe('GitHub pull request selection', () => {
	it('does not call GitHub when no token is configured', async () => {
		const mockTransport = vi.fn();
		vi.stubGlobal('fetch', mockTransport);
		const result = await createGitHubClient({
			token: '',
			repositoryScopes: [],
			windowDays: 7,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext(),
		}).fetchPullRequests();
		expect(result).toEqual({ items: [], unconfigured: true });
		expect(mockTransport).not.toHaveBeenCalled();
	});

	it('defaults to repositories owned by the authenticated user', async () => {
		const searchQueries: string[] = [];
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([
				repository(1, 'albert/personal', 'User'),
				repository(2, 'acme/dashboard'),
			]);
			const body = JSON.parse(String(init?.body));
			searchQueries.push(body.variables.query);
			return jsonResponse({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});
		vi.stubGlobal('fetch', mockTransport);

		await createGitHubClient({
			token: 'token',
			repositoryScopes: [],
			windowDays: 7,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext(),
		}).fetchPullRequests();

		expect(searchQueries).toHaveLength(7);
		expect(searchQueries.every(query => query.includes('user:albert'))).toBe(true);
		expect(searchQueries.every(query => !query.includes('org:acme'))).toBe(true);
		expect(searchQueries.filter(query => !isInvolvementQuery(query))).toEqual([
			'is:pr updated:2026-07-11..2026-07-12 user:albert',
			'is:pr updated:2026-07-13..2026-07-14 user:albert',
			'is:pr updated:2026-07-15..2026-07-16 user:albert',
			'is:pr updated:2026-07-17..2026-07-18 user:albert',
		]);
		expect(searchQueries.filter(query => query.includes('involves:albert'))).toHaveLength(1);
		expect(searchQueries.filter(query => query.includes('review-requested:albert'))).toHaveLength(1);
		expect(searchQueries.filter(query => query.includes('reviewed-by:albert'))).toHaveLength(1);
	});

	it('expands organization wildcards and searches every pull request from the configured window', async () => {
		const searchQueries: string[] = [];
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([
				repository(1, 'acme/api'),
				repository(2, 'acme/web'),
				repository(3, 'other/ignored'),
			]);
			const body = JSON.parse(String(init?.body));
			searchQueries.push(body.variables.query);
			return jsonResponse({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});
		vi.stubGlobal('fetch', mockTransport);

		await createGitHubClient({
			token: 'token',
			repositoryScopes: ['acme/*'],
			windowDays: 14,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext('albert', [], { acme: 'Organization' }),
		}).fetchPullRequests();

		expect(searchQueries).toHaveLength(11);
		expect(searchQueries.every(query => query.includes('org:acme'))).toBe(true);
		expect(searchQueries.every(query => !query.includes('other'))).toBe(true);
		expect(searchQueries.filter(query => !isInvolvementQuery(query))).toEqual([
			'is:pr updated:2026-07-04..2026-07-05 org:acme',
			'is:pr updated:2026-07-06..2026-07-07 org:acme',
			'is:pr updated:2026-07-08..2026-07-09 org:acme',
			'is:pr updated:2026-07-10..2026-07-11 org:acme',
			'is:pr updated:2026-07-12..2026-07-13 org:acme',
			'is:pr updated:2026-07-14..2026-07-15 org:acme',
			'is:pr updated:2026-07-16..2026-07-17 org:acme',
			'is:pr updated:2026-07-18 org:acme',
		]);
		expect(searchQueries.filter(isInvolvementQuery).every(query => query.includes('updated:>=2026-07-04'))).toBe(true);
		expect(searchQueries.every(query => !query.includes('author:'))).toBe(true);
		expect(searchQueries.filter(query => query.includes('involves:albert'))).toHaveLength(1);
		expect(searchQueries.filter(query => query.includes('reviewed-by:albert'))).toHaveLength(1);
		expect(searchQueries.every(query => !query.includes(' OR '))).toBe(true);
		expect(searchQueries.every(query => !query.includes('is:open') && !query.includes('is:closed'))).toBe(true);
	});

	it('keeps owner scopes separate from exact repository searches', async () => {
		const searchQueries: string[] = [];
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([
				repository(1, 'acme/dashboard'),
				repository(2, 'albert/personal', 'User'),
			]);
			const body = JSON.parse(String(init?.body));
			searchQueries.push(body.variables.query);
			return jsonResponse({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});
		vi.stubGlobal('fetch', mockTransport);

		await createGitHubClient({
			token: 'token',
			repositoryScopes: ['acme/*', 'albert/personal'],
			windowDays: 7,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext('albert', [], { acme: 'Organization' }),
		}).fetchPullRequests();

		expect(searchQueries).toHaveLength(14);
		expect(searchQueries.filter(query => query.includes('org:acme'))).toHaveLength(7);
		expect(searchQueries.filter(query => query.includes('repo:albert/personal'))).toHaveLength(7);
		expect(searchQueries.every(query => !(query.includes('org:acme') && query.includes('repo:albert/personal')))).toBe(true);
	});

	it('paginates search results, deduplicates them, and normalizes states', async () => {
		let graphPage = 0;
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([repository(1, 'acme/dashboard')]);
			const body = JSON.parse(String(init?.body));
			if (isInvolvementQuery(body.variables.query)) {
				return jsonResponse({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			graphPage++;
			if (graphPage === 1) {
				return jsonResponse({ data: { search: { nodes: [pullRequest({
					id: 'merged',
					state: 'MERGED',
					mergedAt: '2026-07-18T08:00:00Z',
				})], pageInfo: { hasNextPage: true, endCursor: 'next' } } } });
			}
			return jsonResponse({ data: { search: { nodes: [pullRequest({
				id: 'merged',
				state: 'MERGED',
				mergedAt: '2026-07-18T08:00:00Z',
			}), pullRequest({ id: 'draft', isDraft: true, updatedAt: '2026-07-17T08:00:00Z' })], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await createGitHubClient({
			token: 'token',
			repositoryScopes: ['acme/dashboard'],
			windowDays: 7,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext(),
		}).fetchPullRequests();

		expect(result.items).toHaveLength(2);
		expect(result.items.map(item => item.state)).toEqual(['merged', 'draft']);
		expect(graphPage).toBe(5);
	});

	it('ignores null search nodes returned for inaccessible pull requests', async () => {
		const mockTransport = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			if (isInvolvementQuery(body.variables.query)) {
				return jsonResponse({ data: { search: { nodes: [null], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			return jsonResponse({ data: { search: { nodes: [null, pullRequest()], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await createGitHubClient({
			token: 'token',
			repositoryScopes: ['acme/dashboard'],
			windowDays: 1,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext(),
		}).fetchPullRequests();

		expect(result.items.map(item => item.id)).toEqual(['PR_1']);
	});

	it('marks pull requests that GitHub reports as involving the authenticated user', async () => {
		const searchQueries: string[] = [];
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([repository(1, 'acme/dashboard')]);
			const body = JSON.parse(String(init?.body));
			searchQueries.push(body.variables.query);
			if (body.variables.query.includes('involves:albert')) {
				return jsonResponse({ data: { search: {
					nodes: [pullRequest({ id: 'commented' })],
					pageInfo: { hasNextPage: false, endCursor: null },
				} } });
			}
			if (body.variables.query.includes('review-requested:albert')) {
				return jsonResponse({ data: { search: { nodes: [pullRequest({ id: 'requested' })], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			if (body.variables.query.includes('reviewed-by:albert')) {
				return jsonResponse({ data: { search: { nodes: [pullRequest({ id: 'reviewed' })], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			if (body.variables.query.includes('team-review-requested:acme/developers')) {
				return jsonResponse({ data: { search: { nodes: [pullRequest({ id: 'team-requested' })], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			return jsonResponse({ data: { search: {
				nodes: [
					pullRequest({ id: 'commented' }),
					pullRequest({ id: 'requested' }),
					pullRequest({ id: 'reviewed' }),
					pullRequest({ id: 'team-requested' }),
					pullRequest({ id: 'none', author: { login: 'someone-else' } }),
				],
				pageInfo: { hasNextPage: false, endCursor: null },
			} } });
		});
		vi.stubGlobal('fetch', mockTransport);

		const result = await createGitHubClient({
			token: 'token',
			repositoryScopes: ['acme/dashboard'],
			windowDays: 7,
			requestedAt: new Date('2026-07-18T12:00:00Z'),
			pullRequestContext: pullRequestContext('albert', ['acme/developers']),
		}).fetchPullRequests();

		expect(searchQueries.filter(query => query.includes('team-review-requested:acme/developers'))).toHaveLength(1);
		expect(Object.fromEntries(result.items.map(item => [item.id, item.involved]))).toEqual({
			commented: true,
			requested: true,
			reviewed: true,
			'team-requested': true,
			none: false,
		});
	});
});
