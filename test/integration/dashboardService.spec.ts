import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DashboardResponse } from '@/types/dashboard';
import { createDashboardService, GitHubClientFactory, CalendarClientFactory } from '@/core/dashboard';

const FRESH_CACHE_KEY = 'dashboard:fresh';
const LAST_SUCCESS_CACHE_KEY = 'dashboard:last-success';

vi.mock('@/config/variables', () => ({
	default: {
		DASHBOARD_CONFIG_PATH: 'config/dashboard.json',
		DASHBOARD_CACHE_TTL_SECONDS: 60,
		DASHBOARD_REQUEST_TIMEOUT_MS: 5000,
		DASHBOARD_RETRY_COUNT: 2,
		GITHUB_TOKEN: 'test-token',
		GOOGLE_CLIENT_ID: 'test-client-id',
		GOOGLE_CLIENT_SECRET: 'test-client-secret',
		GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
	},
}));

vi.mock('@/config/dashboard', () => ({
	loadDashboardConfig: vi.fn(),
}));

import { loadDashboardConfig } from '@/config/dashboard';

function createMockCacheDriver(): {
	driver: {
		get<T>(key: string): Promise<T | undefined>;
		set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
		delete(key: string): Promise<void>;
		flush(): Promise<void>;
	};
	cache: Map<string, { value: unknown; ttl?: number; expiresAt?: number }>;
} {
	const cache = new Map<string, { value: unknown; ttl?: number; expiresAt?: number }>();

	const driver = {
		async get<T>(key: string): Promise<T | undefined> {
			const entry = cache.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt && Date.now() > entry.expiresAt) {
				cache.delete(key);
				return undefined;
			}
			return entry.value as T;
		},
		async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
			const entry: { value: unknown; ttl?: number; expiresAt?: number } = { value };
			if (ttlSeconds) {
				entry.ttl = ttlSeconds;
				entry.expiresAt = Date.now() + ttlSeconds * 1000;
			}
			cache.set(key, entry);
		},
		async delete(key: string): Promise<void> {
			cache.delete(key);
		},
		async flush(): Promise<void> {
			cache.clear();
		},
	};

	return { driver, cache };
}

describe('DashboardService', () => {
	let mockCache: ReturnType<typeof createMockCacheDriver>;
	let fixedNow: Date;

	const defaultConfig = {
		displayName: 'Test',
		timeZone: 'Europe/London',
		github: { repositories: ['owner/repo'] },
		calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
		shortcutGroups: [],
	};

	beforeEach(() => {
		mockCache = createMockCacheDriver();
		fixedNow = new Date('2024-06-15T12:00:00Z');
		vi.clearAllMocks();
		(loadDashboardConfig as ReturnType<typeof vi.fn>).mockResolvedValue(defaultConfig);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getSnapshot', () => {
		describe('fresh cache hit', () => {
			it('returns cached data with stale=false and generatedAt=now', async () => {
				const cachedData: DashboardResponse = {
					generatedAt: '2024-06-15T10:00:00Z',
					lastRefreshAt: '2024-06-15T10:00:00Z',
					stale: false,
					timeZone: 'Europe/London',
					displayName: 'Test',
					pullRequests: {
						windowDays: 7,
						counts: { open: 1, draft: 0, merged: 0, closed: 0 },
						items: [],
					},
					calendar: { today: [], upcoming: [] },
					shortcutGroups: [],
					integrations: {
						github: { state: 'ok', lastSuccessAt: '2024-06-15T10:00:00Z', message: null },
						calendar: { state: 'ok', lastSuccessAt: '2024-06-15T10:00:00Z', message: null },
					},
				};
				await mockCache.driver.set(FRESH_CACHE_KEY, cachedData);

				const mockGitHubFactory = vi.fn() as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn() as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				const result = await service.getSnapshot();

				expect(result.stale).toBe(false);
				expect(result.generatedAt).toBe(fixedNow.toISOString());
				expect(result.pullRequests.counts).toEqual({ open: 1, draft: 0, merged: 0, closed: 0 });
			});
		});

		describe('stale cache behavior', () => {
			it('returns last success with stale=true when fresh cache missing', async () => {
				const lastSuccessData: DashboardResponse = {
					generatedAt: '2024-06-15T10:00:00Z',
					lastRefreshAt: '2024-06-15T10:00:00Z',
					stale: false,
					timeZone: 'Europe/London',
					displayName: 'Test',
					pullRequests: {
						windowDays: 7,
						counts: { open: 1, draft: 0, merged: 0, closed: 0 },
						items: [],
					},
					calendar: { today: [], upcoming: [] },
					shortcutGroups: [],
					integrations: {
						github: { state: 'ok', lastSuccessAt: '2024-06-15T10:00:00Z', message: null },
						calendar: { state: 'ok', lastSuccessAt: '2024-06-15T10:00:00Z', message: null },
					},
				};
				await mockCache.driver.set(LAST_SUCCESS_CACHE_KEY, lastSuccessData);

				const mockGitHubClient = {
					fetchPullRequests: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockCalendarClient = {
					fetchEvents: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockGitHubFactory = vi.fn().mockReturnValue(mockGitHubClient) as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn().mockReturnValue(mockCalendarClient) as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				const result = await service.getSnapshot();

				expect(result.stale).toBe(true);
				expect(result.generatedAt).toBe(fixedNow.toISOString());
			});
		});

		describe('cold start refresh', () => {
			it('awaits refresh when no cache exists', async () => {
				const mockGitHubClient = {
					fetchPullRequests: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockCalendarClient = {
					fetchEvents: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockGitHubFactory = vi.fn().mockReturnValue(mockGitHubClient) as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn().mockReturnValue(mockCalendarClient) as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				const result = await service.getSnapshot();

				expect(result.pullRequests).toBeDefined();
				expect(result.calendar).toBeDefined();
			});
		});

		describe('concurrent refresh deduplication', () => {
			it('does not start multiple refreshes for concurrent requests', async () => {
				let refreshCount = 0;
				const mockGitHubClient = {
					fetchPullRequests: vi.fn().mockImplementation(async () => {
						refreshCount++;
						await new Promise(resolve => setTimeout(resolve, 50));
						return { items: [], unconfigured: false };
					}),
				};
				const mockCalendarClient = {
					fetchEvents: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockGitHubFactory = vi.fn().mockReturnValue(mockGitHubClient) as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn().mockReturnValue(mockCalendarClient) as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				const [result1, result2, result3] = await Promise.all([
					service.getSnapshot(),
					service.getSnapshot(),
					service.getSnapshot(),
				]);

				expect(refreshCount).toBe(1);
			});
		});

		describe('cache writes', () => {
			it('writes to both fresh and last-success cache after refresh', async () => {
				const mockGitHubClient = {
					fetchPullRequests: vi.fn().mockResolvedValue({
						items: [
							{
								id: 'pr-1',
								repository: 'owner/repo',
								number: 1,
								title: 'Test PR',
								author: 'user',
								reviewState: 'approved',
								state: 'open',
								createdAt: '2024-06-14T00:00:00Z',
								updatedAt: '2024-06-14T12:00:00Z',
								url: 'https://github.com/owner/repo/pull/1',
								labels: [],
							},
						],
						unconfigured: false,
					}),
				};
				const mockCalendarClient = {
					fetchEvents: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockGitHubFactory = vi.fn().mockReturnValue(mockGitHubClient) as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn().mockReturnValue(mockCalendarClient) as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				await service.getSnapshot();

				const fresh = await mockCache.driver.get<DashboardResponse>(FRESH_CACHE_KEY);
				const lastSuccess = await mockCache.driver.get<DashboardResponse>(LAST_SUCCESS_CACHE_KEY);

				expect(fresh).not.toBeUndefined();
				expect(lastSuccess).not.toBeUndefined();
				expect(fresh?.pullRequests.items).toHaveLength(1);
				expect(lastSuccess?.pullRequests.items).toHaveLength(1);
			});
		});

		describe('pull request counts', () => {
			it('calculates mutually exclusive counts from items', async () => {
				const mockGitHubClient = {
					fetchPullRequests: vi.fn().mockResolvedValue({
						items: [
							{
								id: 'pr-1',
								repository: 'owner/repo',
								number: 1,
								title: 'Open PR',
								author: 'user',
								reviewState: 'approved',
								state: 'open',
								createdAt: '2024-06-14T00:00:00Z',
								updatedAt: '2024-06-14T12:00:00Z',
								url: 'https://github.com/owner/repo/pull/1',
								labels: [],
							},
							{
								id: 'pr-2',
								repository: 'owner/repo',
								number: 2,
								title: 'Draft PR',
								author: 'user',
								reviewState: 'draft',
								state: 'draft',
								createdAt: '2024-06-14T00:00:00Z',
								updatedAt: '2024-06-14T12:00:00Z',
								url: 'https://github.com/owner/repo/pull/2',
								labels: [],
							},
							{
								id: 'pr-3',
								repository: 'owner/repo',
								number: 3,
								title: 'Merged PR',
								author: 'user',
								reviewState: 'approved',
								state: 'merged',
								createdAt: '2024-06-14T00:00:00Z',
								updatedAt: '2024-06-14T12:00:00Z',
								url: 'https://github.com/owner/repo/pull/3',
								labels: [],
							},
							{
								id: 'pr-4',
								repository: 'owner/repo',
								number: 4,
								title: 'Closed PR',
								author: 'user',
								reviewState: 'changes_requested',
								state: 'closed',
								createdAt: '2024-06-14T00:00:00Z',
								updatedAt: '2024-06-14T12:00:00Z',
								url: 'https://github.com/owner/repo/pull/4',
								labels: [],
							},
						],
						unconfigured: false,
					}),
				};
				const mockCalendarClient = {
					fetchEvents: vi.fn().mockResolvedValue({ items: [], unconfigured: false }),
				};
				const mockGitHubFactory = vi.fn().mockReturnValue(mockGitHubClient) as unknown as GitHubClientFactory;
				const mockCalendarFactory = vi.fn().mockReturnValue(mockCalendarClient) as unknown as CalendarClientFactory;

				const service = createDashboardService({
					cacheDriver: mockCache.driver,
					now: fixedNow,
					githubClientFactory: mockGitHubFactory,
					calendarClientFactory: mockCalendarFactory,
				});

				const result = await service.getSnapshot();

				expect(result.pullRequests.counts).toEqual({
					open: 1,
					draft: 1,
					merged: 1,
					closed: 1,
				});
			});
		});
	});
});
