import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationRequestError } from '@/integrations/http';
import { createGitHubClient } from '@/integrations/github';

describe('GitHub integration', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockFetch: any;

	beforeEach(() => {
		mockFetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createGitHubResponse(data: object, errors?: Array<{ message: string }>): object {
		return {
			data,
			errors,
		};
	}

	describe('createGitHubClient', () => {
		describe('unconfigured behavior', () => {
			it('returns unconfigured=true when token is missing', async () => {
				const client = createGitHubClient({
					token: '',
					repositories: ['owner/repo'],
				});

				const result = await client.fetchPullRequests();

				expect(result.unconfigured).toBe(true);
				expect(result.items).toEqual([]);
			});

			it('returns unconfigured=true when repositories array is empty', async () => {
				const client = createGitHubClient({
					token: 'ghp_token',
					repositories: [],
				});

				const result = await client.fetchPullRequests();

				expect(result.unconfigured).toBe(true);
				expect(result.items).toEqual([]);
			});

			it('returns unconfigured=true when token is undefined', async () => {
				const client = createGitHubClient({
					token: undefined as any,
					repositories: ['owner/repo'],
				});

				const result = await client.fetchPullRequests();

				expect(result.unconfigured).toBe(true);
				expect(result.items).toEqual([]);
			});
		});

		describe('GraphQL query construction and authorization', () => {
			it('sends correct authorization header', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [],
								pageInfo: { endCursor: null, hasNextPage: false },
								rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await client.fetchPullRequests();

				expect(mockFetch).toHaveBeenCalledWith(
					'https://api.github.com/graphql',
					expect.objectContaining({
						method: 'POST',
						headers: expect.objectContaining({
							Authorization: 'Bearer ghp_test_token',
							'Content-Type': 'application/json',
						}),
					})
				);
			});

			it('includes correct GraphQL query variables', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [],
								pageInfo: { endCursor: null, hasNextPage: false },
								rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['my-org/my-repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await client.fetchPullRequests();

				const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
				expect(callBody.variables).toEqual({
					owner: 'my-org',
					repo: 'my-repo',
					cursor: null,
				});
			});

			it('uses cursor in subsequent pagination requests', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR1',
										number: 1,
										title: 'First PR',
										url: 'https://github.com/owner/repo/pull/1',
										createdAt: '2024-06-14T00:00:00Z',
										updatedAt: '2024-06-14T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: { login: 'author1' },
										reviewDecision: null,
										labels: { nodes: [] },
									},
								],
								pageInfo: { endCursor: 'cursor123', hasNextPage: true },
								rateLimit: { remaining: 99, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR2',
										number: 2,
										title: 'Second PR',
										url: 'https://github.com/owner/repo/pull/2',
										createdAt: '2024-06-13T00:00:00Z',
										updatedAt: '2024-06-13T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: { login: 'author2' },
										reviewDecision: null,
										labels: { nodes: [] },
									},
								],
								pageInfo: { endCursor: null, hasNextPage: false },
								rateLimit: { remaining: 98, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await client.fetchPullRequests();

				expect(mockFetch).toHaveBeenCalledTimes(2);

				const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
				expect(firstCallBody.variables.cursor).toBeNull();

				const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
				expect(secondCallBody.variables.cursor).toBe('cursor123');
			});
		});

		describe('rate limiting', () => {
			it('stops and throws when rate limit is exhausted', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR1',
										number: 1,
										title: 'Test PR',
										url: 'https://github.com/owner/repo/pull/1',
										createdAt: '2024-06-14T00:00:00Z',
										updatedAt: '2024-06-14T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: { login: 'author1' },
										reviewDecision: null,
										labels: { nodes: [] },
									},
								],
								pageInfo: { endCursor: 'cursor123', hasNextPage: true },
								rateLimit: { remaining: 0, resetAt: '2024-06-15T13:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await expect(client.fetchPullRequests()).rejects.toMatchObject({
					provider: 'github',
					status: 429,
				});
			});

			it('includes reset time in error message', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR1',
										number: 1,
										title: 'Test PR',
										url: 'https://github.com/owner/repo/pull/1',
										createdAt: '2024-06-14T00:00:00Z',
										updatedAt: '2024-06-14T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: { login: 'author1' },
										reviewDecision: null,
										labels: { nodes: [] },
									},
								],
								pageInfo: { endCursor: 'cursor123', hasNextPage: true },
								rateLimit: { remaining: 0, resetAt: '2024-06-15T14:30:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				try {
					await client.fetchPullRequests();
					expect.fail('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(IntegrationRequestError);
					expect((error as IntegrationRequestError).message).toContain('Rate limit resets at 2024-06-15T14:30:00Z');
				}
			});
		});

		describe('GraphQL errors', () => {
			it('throws on GraphQL errors array even with HTTP 200', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({}, [{ message: 'Something went wrong' }])),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await expect(client.fetchPullRequests()).rejects.toThrow(IntegrationRequestError);
			});

			it('throws when repository is not found', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({ repository: null })),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['nonexistent/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await expect(client.fetchPullRequests()).rejects.toMatchObject({
					status: 404,
					provider: 'github',
				});
			});
		});

		describe('pull request normalization', () => {
			it('maps null author to Unknown', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR1',
										number: 1,
										title: 'PR with no author',
										url: 'https://github.com/owner/repo/pull/1',
										createdAt: '2024-06-14T00:00:00Z',
										updatedAt: '2024-06-14T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: null,
										reviewDecision: null,
										labels: { nodes: [] },
									},
								],
								pageInfo: { endCursor: null, hasNextPage: false },
								rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				const result = await client.fetchPullRequests();

				expect(result.items[0].author).toBe('Unknown');
			});

			it('sorts labels alphabetically and truncates to 20', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => JSON.stringify(createGitHubResponse({
						repository: {
							pullRequests: {
								nodes: [
									{
										id: 'PR1',
										number: 1,
										title: 'Test PR',
										url: 'https://github.com/owner/repo/pull/1',
										createdAt: '2024-06-14T00:00:00Z',
										updatedAt: '2024-06-14T12:00:00Z',
										isDraft: false,
										state: 'OPEN',
										mergedAt: null,
										author: { login: 'testuser' },
										reviewDecision: null,
										labels: {
											nodes: [
												{ name: 'z-label' },
												{ name: 'a-label' },
												{ name: 'm-label' },
											],
										},
									},
								],
								pageInfo: { endCursor: null, hasNextPage: false },
								rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
							},
						},
					})),
				});

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				const result = await client.fetchPullRequests();

				expect(result.items[0].labels).toEqual(['a-label', 'm-label', 'z-label']);
			});

			describe('state mapping', () => {
				it('maps isDraft=true to draft state', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Draft PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: true,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].state).toBe('draft');
				});

				it('maps non-draft OPEN to open state', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Open PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].state).toBe('open');
				});

				it('maps MERGED state to merged state', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Merged PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'MERGED',
											mergedAt: '2024-06-14T15:00:00Z',
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].state).toBe('merged');
				});

				it('maps non-draft CLOSED to closed state', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Closed PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'CLOSED',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].state).toBe('closed');
				});

				it('maps null mergedAt on MERGED state to merged', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Merged PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'MERGED',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].state).toBe('merged');
				});
			});

			describe('review state mapping', () => {
				it('maps drafts to draft review state', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Draft PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: true,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: 'APPROVED',
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].reviewState).toBe('draft');
				});

				it('maps APPROVED to approved', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Approved PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: 'APPROVED',
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].reviewState).toBe('approved');
				});

				it('maps CHANGES_REQUESTED to changes_requested', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Changes Requested PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: 'CHANGES_REQUESTED',
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].reviewState).toBe('changes_requested');
				});

				it('maps null reviewDecision to review_required', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'No Review PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].reviewState).toBe('review_required');
				});

				it('maps REVIEW_REQUIRED to review_required', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Review Required PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'testuser' },
											reviewDecision: 'REVIEW_REQUIRED',
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].reviewState).toBe('review_required');
				});
			});

			describe('ordering', () => {
				it('sorts by updatedAt descending', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Older PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-10T00:00:00Z',
											updatedAt: '2024-06-12T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user1' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
										{
											id: 'PR2',
											number: 2,
											title: 'Newer PR',
											url: 'https://github.com/owner/repo/pull/2',
											createdAt: '2024-06-13T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user2' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items[0].title).toBe('Newer PR');
					expect(result.items[1].title).toBe('Older PR');
				});
			});

			describe('seven-day cutoff', () => {
				it('filters out PRs older than seven days', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Recent PR',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-10T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user1' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
										{
											id: 'PR2',
											number: 2,
											title: 'Old PR',
											url: 'https://github.com/owner/repo/pull/2',
											createdAt: '2024-06-01T00:00:00Z',
											updatedAt: '2024-06-05T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user2' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(result.items).toHaveLength(1);
					expect(result.items[0].title).toBe('Recent PR');
				});

				it('continues pagination while oldest item is within window', async () => {
mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR1',
											number: 1,
											title: 'Recent in batch',
											url: 'https://github.com/owner/repo/pull/1',
											createdAt: '2024-06-14T00:00:00Z',
											updatedAt: '2024-06-14T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user1' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
										{
											id: 'PR2',
											number: 2,
											title: 'Also recent',
											url: 'https://github.com/owner/repo/pull/2',
											createdAt: '2024-06-13T00:00:00Z',
											updatedAt: '2024-06-13T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user2' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: 'page2cursor', hasNextPage: true },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});
					mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => JSON.stringify(createGitHubResponse({
							repository: {
								pullRequests: {
									nodes: [
										{
											id: 'PR3',
											number: 3,
											title: 'Older page',
											url: 'https://github.com/owner/repo/pull/3',
											createdAt: '2024-06-08T00:00:00Z',
											updatedAt: '2024-06-08T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user3' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
										{
											id: 'PR4',
											number: 4,
											title: 'Too old',
											url: 'https://github.com/owner/repo/pull/4',
											createdAt: '2024-06-01T00:00:00Z',
											updatedAt: '2024-06-05T12:00:00Z',
											isDraft: false,
											state: 'OPEN',
											mergedAt: null,
											author: { login: 'user4' },
											reviewDecision: null,
											labels: { nodes: [] },
										},
									],
									pageInfo: { endCursor: null, hasNextPage: false },
									rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
								},
							},
						})),
					});

					const client = createGitHubClient({
						token: 'ghp_test_token',
						repositories: ['owner/repo'],
						fetchImpl: mockFetch,
						now: new Date('2024-06-15T12:00:00Z'),
					});

					const result = await client.fetchPullRequests();

					expect(mockFetch).toHaveBeenCalledTimes(2);
					expect(result.items).toHaveLength(3);
					expect(result.items.map((pr) => pr.title)).toEqual([
												'Recent in batch',
												'Also recent',
												'Older page',
											]);
				});
			});
		});

		describe('concurrency', () => {
			it('fetches repositories with concurrency of 4', async () => {
				const callTimes: number[] = [];

				for (let i = 0; i < 6; i++) {
					mockFetch.mockResolvedValueOnce({
						ok: true,
						status: 200,
						headers: { get: () => null },
						text: async () => {
							callTimes.push(Date.now());
							return JSON.stringify(createGitHubResponse({
								repository: {
									pullRequests: {
										nodes: [
											{
												id: `PR${i}`,
												number: i,
												title: `PR ${i}`,
												url: `https://github.com/owner/repo${i}/pull/${i}`,
												createdAt: '2024-06-14T00:00:00Z',
												updatedAt: '2024-06-14T12:00:00Z',
												isDraft: false,
												state: 'OPEN',
												mergedAt: null,
												author: { login: 'user' },
												reviewDecision: null,
												labels: { nodes: [] },
											},
										],
										pageInfo: { endCursor: null, hasNextPage: false },
										rateLimit: { remaining: 100, resetAt: '2024-01-01T00:00:00Z' },
									},
								},
							}));
						},
					});
				}

				const client = createGitHubClient({
					token: 'ghp_test_token',
					repositories: ['owner/repo0', 'owner/repo1', 'owner/repo2', 'owner/repo3', 'owner/repo4', 'owner/repo5'],
					fetchImpl: mockFetch,
					now: new Date('2024-06-15T12:00:00Z'),
				});

				await client.fetchPullRequests();

				expect(mockFetch).toHaveBeenCalledTimes(6);
			});
		});
	});
});
