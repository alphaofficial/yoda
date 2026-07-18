import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, discoverGitHubRepositories } from '@/integrations/github';
import { createHttpClient } from '@/integrations/http';

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
		reviewDecision: 'REVIEW_REQUIRED',
		repository: { nameWithOwner: 'acme/dashboard' },
		labels: { nodes: [{ name: 'dashboard' }] },
		...overrides,
	};
}

describe('GitHub repository discovery', () => {
	it('paginates all repositories available to the authenticated user', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => repository(index, `acme/repo-${index}`));
		const mockTransport = vi.fn()
			.mockResolvedValueOnce(jsonResponse({ login: 'albert' }))
			.mockResolvedValueOnce(jsonResponse(firstPage))
			.mockResolvedValueOnce(jsonResponse([repository(101, 'albert/personal', 'User')]));

		const result = await discoverGitHubRepositories('token', createHttpClient({ transport: mockTransport }));

		expect(result.viewerLogin).toBe('albert');
		expect(result.repositories).toHaveLength(101);
		expect(result.defaultScopes).toEqual(['albert/*']);
		expect(String(mockTransport.mock.calls[1][0])).toContain('per_page=100&page=1');
		expect(String(mockTransport.mock.calls[2][0])).toContain('per_page=100&page=2');
	});
});

describe('GitHub pull request selection', () => {
	it('does not call GitHub when no token is configured', async () => {
		const mockTransport = vi.fn();
		const result = await createGitHubClient({ token: '', repositories: [], httpClient: createHttpClient({ transport: mockTransport }) }).fetchPullRequests();
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

		await createGitHubClient({ token: 'token', repositories: [], httpClient: createHttpClient({ transport: mockTransport }), now: new Date('2026-07-18T12:00:00Z') }).fetchPullRequests();

		expect(searchQueries).toHaveLength(3);
		expect(searchQueries.every(query => query.includes('repo:albert/personal'))).toBe(true);
		expect(searchQueries.every(query => !query.includes('repo:acme/dashboard'))).toBe(true);
	});

	it('expands organization wildcards and searches all involvement states from the configured window', async () => {
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

		await createGitHubClient({ token: 'token', repositories: ['acme/*'], windowDays: 14, httpClient: createHttpClient({ transport: mockTransport }), now: new Date('2026-07-18T12:00:00Z') }).fetchPullRequests();

		expect(searchQueries).toHaveLength(3);
		expect(searchQueries.every(query => query.includes('repo:acme/api repo:acme/web'))).toBe(true);
		expect(searchQueries.every(query => !query.includes('other/ignored'))).toBe(true);
		expect(searchQueries.every(query => query.includes('updated:>=2026-07-04'))).toBe(true);
		expect(searchQueries).toEqual(expect.arrayContaining([
			expect.stringContaining('author:albert'),
			expect.stringContaining('review-requested:albert'),
			expect.stringContaining('reviewed-by:albert'),
		]));
		expect(searchQueries.every(query => !query.includes(' OR '))).toBe(true);
		expect(searchQueries.every(query => !query.includes('is:open') && !query.includes('is:closed'))).toBe(true);
	});

	it('paginates search results, deduplicates them, and normalizes states', async () => {
		let graphPage = 0;
		const mockTransport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/user')) return jsonResponse({ login: 'albert' });
			if (url.includes('/user/repos')) return jsonResponse([repository(1, 'acme/dashboard')]);
			const body = JSON.parse(String(init?.body));
			if (!body.variables.query.includes('author:albert')) {
				return jsonResponse({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
			}
			graphPage++;
			if (graphPage === 1) {
				return jsonResponse({ data: { search: { nodes: [pullRequest({ id: 'merged', state: 'MERGED', mergedAt: '2026-07-18T08:00:00Z' })], pageInfo: { hasNextPage: true, endCursor: 'next' } } } });
			}
			return jsonResponse({ data: { search: { nodes: [pullRequest({ id: 'merged', state: 'MERGED', mergedAt: '2026-07-18T08:00:00Z' }), pullRequest({ id: 'draft', isDraft: true, updatedAt: '2026-07-17T08:00:00Z' })], pageInfo: { hasNextPage: false, endCursor: null } } } });
		});

		const result = await createGitHubClient({ token: 'token', repositories: ['acme/dashboard'], httpClient: createHttpClient({ transport: mockTransport }) }).fetchPullRequests();

		expect(result.items).toHaveLength(2);
		expect(result.items.map(item => item.state)).toEqual(['merged', 'draft']);
		expect(result.items[1].reviewState).toBe('draft');
		expect(graphPage).toBe(2);
	});
});
