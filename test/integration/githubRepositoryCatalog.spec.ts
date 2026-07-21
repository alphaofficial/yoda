import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Cache } from '@/primitives/cache';
import { createMemoryCacheDriver } from '@/runtime/drivers/cache/memory';
import { clearPrimitiveRuntime } from '@/runtime/primitiveRegistry';
import type { GitHubRepositoryCatalog } from '@/types/dashboard';

const mocks = vi.hoisted(() => ({
	discoverGitHubRepositories: vi.fn(),
	getSettings: vi.fn(),
}));

vi.mock('@/integrations/github', () => ({
	discoverGitHubRepositories: mocks.discoverGitHubRepositories,
	discoverGitHubPullRequestContext: vi.fn(),
	createGitHubClient: vi.fn(),
}));

vi.mock('@/repositories/DashboardRepository', () => ({
	DashboardRepository: Object.freeze({ getSettings: mocks.getSettings }),
}));

vi.mock('@/config/variables', () => ({
	default: { GITHUB_REPOSITORY_CACHE_TTL_SECONDS: 86_400 },
}));

import { dashboard } from '@/core/dashboard';

const catalog: GitHubRepositoryCatalog = {
	viewerLogin: 'albert',
	repositories: [],
	defaultScopes: ['albert/*'],
	teams: [],
};

describe('GitHub repository catalog cache', () => {
	beforeEach(() => {
		clearPrimitiveRuntime('cache');
		Cache.configure(createMemoryCacheDriver());
		mocks.discoverGitHubRepositories.mockReset().mockResolvedValue(catalog);
		mocks.getSettings.mockResolvedValue({ githubToken: 'token' });
	});

	afterEach(() => {
		clearPrimitiveRuntime('cache');
	});

	it('reuses the cached catalog for repeated loads with the same token', async () => {
		await dashboard.githubRepositories({} as never, false);
		await dashboard.githubRepositories({} as never, false);

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(1);
	});

	it('does not reuse a catalog created with another token', async () => {
		mocks.getSettings.mockResolvedValueOnce({ githubToken: 'first-token' }).mockResolvedValueOnce({ githubToken: 'second-token' });
		await dashboard.githubRepositories({} as never, false);
		await dashboard.githubRepositories({} as never, false);

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(2);
	});

	it('bypasses the cache when refresh is requested', async () => {
		await dashboard.githubRepositories({} as never, false);
		await dashboard.githubRepositories({} as never, true);

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(2);
	});
});
