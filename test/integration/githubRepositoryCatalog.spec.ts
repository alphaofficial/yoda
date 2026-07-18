import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Cache } from '@/primitives/cache';
import { createMemoryCacheDriver } from '@/runtime/drivers/cache/memory';
import { clearPrimitiveRuntime } from '@/runtime/primitiveRegistry';
import type { GitHubRepositoryCatalog } from '@/types/dashboard';

const mocks = vi.hoisted(() => ({
	discoverGitHubRepositories: vi.fn(),
}));

vi.mock('@/integrations/github', () => ({
	discoverGitHubRepositories: mocks.discoverGitHubRepositories,
}));

vi.mock('@/config/variables', () => ({
	default: { GITHUB_REPOSITORY_CACHE_TTL_SECONDS: 900 },
}));

import { getGitHubRepositoryCatalog } from '@/core/githubRepositories';

const catalog: GitHubRepositoryCatalog = {
	viewerLogin: 'albert',
	repositories: [],
	defaultScopes: ['albert/*'],
};

describe('GitHub repository catalog cache', () => {
	beforeEach(() => {
		clearPrimitiveRuntime('cache');
		Cache.configure(createMemoryCacheDriver());
		mocks.discoverGitHubRepositories.mockReset().mockResolvedValue(catalog);
	});

	afterEach(() => {
		clearPrimitiveRuntime('cache');
	});

	it('reuses the cached catalog for repeated loads with the same token', async () => {
		await getGitHubRepositoryCatalog('token');
		await getGitHubRepositoryCatalog('token');

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(1);
	});

	it('does not reuse a catalog created with another token', async () => {
		await getGitHubRepositoryCatalog('first-token');
		await getGitHubRepositoryCatalog('second-token');

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(2);
	});

	it('bypasses the cache when refresh is requested', async () => {
		await getGitHubRepositoryCatalog('token');
		await getGitHubRepositoryCatalog('token', true);

		expect(mocks.discoverGitHubRepositories).toHaveBeenCalledTimes(2);
	});
});
