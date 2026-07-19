import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboard } from '@/core/dashboard';
import { Cache } from '@/primitives/cache';
import { clearPrimitiveRuntime } from '@/runtime/primitiveRegistry';
import type { DashboardConfig, PullRequestItem } from '@/types/dashboard';

const mocks = vi.hoisted(() => ({
	getSettings: vi.fn(),
	discoverGitHubRepositories: vi.fn(),
	fetchPullRequests: vi.fn(),
}));

vi.mock('@/config/variables', () => ({
	env: (key: string) => key === 'DB_PATH' ? ':memory:' : undefined,
	default: {
		DASHBOARD_CACHE_TTL_SECONDS: 60,
		DASHBOARD_REQUEST_TIMEOUT_MS: 5000,
		DASHBOARD_RETRY_COUNT: 2,
	},
}));

vi.mock('@/repositories/DashboardRepository', () => ({
	createDashboardRepository: vi.fn(() => ({ getSettings: mocks.getSettings })),
}));

vi.mock('@/integrations/github', () => ({
	createGitHubClient: vi.fn(() => ({ fetchPullRequests: mocks.fetchPullRequests })),
	discoverGitHubRepositories: mocks.discoverGitHubRepositories,
}));

function createMockCacheDriver() {
	const cache = new Map<string, { value: unknown; ttl?: number; expiresAt?: number }>();
	return {
		cache,
		driver: {
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
				cache.set(key, {
					value,
					ttl: ttlSeconds,
					expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
				});
			},
			async delete(key: string): Promise<void> {
				cache.delete(key);
			},
			async flush(): Promise<void> {
				cache.clear();
			},
		},
	};
}

const pullRequest: PullRequestItem = {
	id: 'pr-1',
	repository: 'owner/repo',
	number: 1,
	title: 'Test PR',
	author: 'user',
	involved: true,
	state: 'open',
	createdAt: '2024-06-14T00:00:00Z',
	updatedAt: '2024-06-14T12:00:00Z',
	url: 'https://github.com/owner/repo/pull/1',
	labels: [],
};

function config(overrides: Partial<DashboardConfig> = {}): DashboardConfig {
	return {
		displayName: 'Test',
		timeZone: 'Europe/London',
		timeFormat: '12',
		theme: 'light',
		shortcutLimit: 8,
		githubToken: 'test-token',
		github: { repositoryScopes: ['owner/repo'], windowDays: 7 },
		shortcutGroups: [],
		...overrides,
	};
}

describe('dashboard use cases', () => {
	let mockCache: ReturnType<typeof createMockCacheDriver>;
	const currentDateTime = new Date('2024-06-15T12:00:00Z');

	beforeEach(() => {
		mockCache = createMockCacheDriver();
		clearPrimitiveRuntime('cache');
		Cache.configure(mockCache.driver);
		mocks.getSettings.mockResolvedValue(config());
		mocks.discoverGitHubRepositories.mockResolvedValue({
			viewerLogin: 'owner',
			repositories: [],
			defaultScopes: ['owner/*'],
			teams: [],
		});
		mocks.fetchPullRequests.mockResolvedValue({ items: [pullRequest], unconfigured: false });
	});

	afterEach(() => {
		clearPrimitiveRuntime('cache');
		vi.clearAllMocks();
	});

	it('reads settings from SQLite on every request while reusing cached pull requests', async () => {
		await dashboard.get({} as never, currentDateTime);
		mocks.getSettings.mockResolvedValue(config({ displayName: 'Changed in SQLite', shortcutLimit: 3 }));

		const dashboardData = await dashboard.get({} as never, currentDateTime);

		expect(mocks.getSettings).toHaveBeenCalledTimes(2);
		expect(mocks.fetchPullRequests).toHaveBeenCalledTimes(1);
		expect(dashboardData.displayName).toBe('Changed in SQLite');
		expect(dashboardData.shortcutLimit).toBe(3);
		expect(dashboardData.pullRequests.items).toEqual([pullRequest]);
	});

	it('caches only GitHub pull-request data with the configured TTL', async () => {
		await dashboard.get({} as never, currentDateTime);

		const entry = mockCache.cache.get('github:pull-requests');
		expect(entry?.ttl).toBe(60);
		expect(entry?.value).toMatchObject({ items: [pullRequest], fetchedAt: currentDateTime.toISOString() });
		expect(entry?.value).not.toHaveProperty('displayName');
		expect(entry?.value).not.toHaveProperty('shortcutGroups');
	});

	it('fetches fresh pull requests after the cache expires', async () => {
		await dashboard.get({} as never, currentDateTime);
		mockCache.cache.get('github:pull-requests')!.expiresAt = Date.now() - 1;

		await dashboard.get({} as never, currentDateTime);

		expect(mocks.fetchPullRequests).toHaveBeenCalledTimes(2);
	});

	it('replaces cached pull requests that do not contain involvement data', async () => {
		await dashboard.get({} as never, currentDateTime);
		const cached = mockCache.cache.get('github:pull-requests')!.value as { items: Array<Partial<PullRequestItem>> };
		delete cached.items[0].involved;

		await dashboard.get({} as never, currentDateTime);

		expect(mocks.fetchPullRequests).toHaveBeenCalledTimes(2);
	});

	it('fetches and replaces the cache when refresh is forced', async () => {
		await dashboard.get({} as never, currentDateTime);
		await dashboard.refreshPullRequests({} as never, currentDateTime);

		expect(mocks.fetchPullRequests).toHaveBeenCalledTimes(2);
	});

	it('does not reuse pull requests after the GitHub configuration changes', async () => {
		await dashboard.get({} as never, currentDateTime);
		mocks.getSettings.mockResolvedValue(config({ github: { repositoryScopes: ['other/repo'], windowDays: 7 } }));

		await dashboard.get({} as never, currentDateTime);

		expect(mocks.fetchPullRequests).toHaveBeenCalledTimes(2);
	});

	it('does not call GitHub when no token is configured', async () => {
		mocks.getSettings.mockResolvedValue(config({ githubToken: null }));

		const dashboardData = await dashboard.get({} as never, currentDateTime);

		expect(mocks.fetchPullRequests).not.toHaveBeenCalled();
		expect(dashboardData.integrations.github.state).toBe('unconfigured');
		expect(dashboardData.pullRequests.items).toEqual([]);
	});
});
