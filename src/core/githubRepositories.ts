import { createHash } from 'node:crypto';
import variables from '@/config/variables';
import { discoverGitHubRepositories } from '@/integrations/github';
import { Cache } from '@/primitives/cache';
import type { GitHubRepositoryCatalog } from '@/types/dashboard';

const REPOSITORY_CATALOG_CACHE_KEY = 'github:repository-catalog';

interface CachedRepositoryCatalog {
	tokenFingerprint: string;
	catalog: GitHubRepositoryCatalog;
}

function fingerprint(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function getCachedGitHubRepositoryCatalog(token: string): Promise<GitHubRepositoryCatalog | undefined> {
	const cached = await Cache.get<CachedRepositoryCatalog>(REPOSITORY_CATALOG_CACHE_KEY);
	return cached?.tokenFingerprint === fingerprint(token) ? cached.catalog : undefined;
}

export async function getGitHubRepositoryCatalog(token: string, refresh = false): Promise<GitHubRepositoryCatalog> {
	const tokenFingerprint = fingerprint(token);
	if (!refresh) {
		const cached = await getCachedGitHubRepositoryCatalog(token);
		if (cached) return cached;
	}

	const catalog = await discoverGitHubRepositories(token);
	await Cache.set(REPOSITORY_CATALOG_CACHE_KEY, {
		tokenFingerprint,
		catalog,
	} satisfies CachedRepositoryCatalog, variables.GITHUB_REPOSITORY_CACHE_TTL_SECONDS);
	return catalog;
}
