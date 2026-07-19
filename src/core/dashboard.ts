import { createHash } from 'crypto';
import type { EntityManager } from '@mikro-orm/core';
import variables from '@/config/variables';
import { createGitHubClient, discoverGitHubPullRequestContext, discoverGitHubRepositories } from '@/integrations/github';
import { PinoLogger } from '@/logger/pinoLogger';
import { Cache } from '@/primitives/cache';
import { createDashboardRepository } from '@/repositories/DashboardRepository';
import type {
	AddShortcutInput,
	DashboardConfig,
	DashboardResponse,
	GitHubPullRequestContext,
	GitHubRepositoryCatalog,
	IntegrationHealth,
	PullRequestItem,
	ShortcutGroupConfig,
	ShortcutGroup,
	ShortcutIcon,
} from '@/types/dashboard';

const PULL_REQUEST_CACHE_KEY = 'github:pull-requests';
const PULL_REQUEST_CONTEXT_CACHE_KEY = 'github:pull-request-context';
const REPOSITORY_CATALOG_CACHE_KEY = 'github:repository-catalog';

interface CachedPullRequests {
	configurationHash: string;
	fetchedAt: string;
	items: PullRequestItem[];
	error: string | null;
}

interface CachedRepositoryCatalog {
	tokenFingerprint: string;
	catalog: GitHubRepositoryCatalog;
}

interface CachedPullRequestContext {
	configurationHash: string;
	context: GitHubPullRequestContext;
}

function calculatePrCounts(items: PullRequestItem[]): { open: number; draft: number; merged: number; closed: number } {
	const counts = { open: 0, draft: 0, merged: 0, closed: 0 };
	for (const item of items) counts[item.state]++;
	return counts;
}

function shortcutGroupsFromSettings(settings: DashboardConfig): ShortcutGroup[] {
	return settings.shortcutGroups.map(group => ({
		id: group.id,
		label: group.label,
		shortcuts: group.shortcuts.map(shortcut => ({
			id: shortcut.id,
			label: shortcut.label,
			url: shortcut.url,
			icon: shortcut.icon as ShortcutIcon,
		})),
	}));
}

function configurationHash(settings: DashboardConfig): string {
	return createHash('sha256')
		.update(JSON.stringify({
			token: settings.githubToken,
			repositoryScopes: settings.github.repositoryScopes,
			windowDays: settings.github.windowDays,
		}))
		.digest('hex');
}

function tokenFingerprint(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function pullRequestContextHash(token: string, repositoryScopes: string[]): string {
	return createHash('sha256')
		.update(JSON.stringify({
			token,
			wildcardScopes: repositoryScopes.filter(scope => scope.endsWith('/*')).sort(),
		}))
		.digest('hex');
}

async function getGitHubPullRequestContext(token: string, repositoryScopes: string[]): Promise<GitHubPullRequestContext> {
	const hash = pullRequestContextHash(token, repositoryScopes);
	const cached = await Cache.get<CachedPullRequestContext>(PULL_REQUEST_CONTEXT_CACHE_KEY);
	if (cached?.configurationHash === hash) return cached.context;

	const context = await discoverGitHubPullRequestContext(token, repositoryScopes);
	await Cache.set(PULL_REQUEST_CONTEXT_CACHE_KEY, {
		configurationHash: hash,
		context,
	} satisfies CachedPullRequestContext, variables.GITHUB_REPOSITORY_CACHE_TTL_SECONDS);
	return context;
}

async function getGitHubRepositoryCatalog(token: string, refresh: boolean): Promise<GitHubRepositoryCatalog> {
	const fingerprint = tokenFingerprint(token);
	if (!refresh) {
		const cached = await Cache.get<CachedRepositoryCatalog>(REPOSITORY_CATALOG_CACHE_KEY);
		if (cached?.tokenFingerprint === fingerprint && Array.isArray(cached.catalog.teams)) return cached.catalog;
	}

	const catalog = await discoverGitHubRepositories(token);
	await Cache.set(REPOSITORY_CATALOG_CACHE_KEY, {
		tokenFingerprint: fingerprint,
		catalog,
	} satisfies CachedRepositoryCatalog, variables.GITHUB_REPOSITORY_CACHE_TTL_SECONDS);
	return catalog;
}

async function fetchPullRequests(settings: DashboardConfig, currentDateTime: Date): Promise<CachedPullRequests> {
	const hash = configurationHash(settings);
	try {
		const pullRequestContext = await getGitHubPullRequestContext(settings.githubToken!, settings.github.repositoryScopes);
		const result = await createGitHubClient({
			token: settings.githubToken!,
			repositoryScopes: settings.github.repositoryScopes,
			windowDays: settings.github.windowDays ?? 7,
			requestedAt: currentDateTime,
			pullRequestContext,
		}).fetchPullRequests();
		return {
			configurationHash: hash,
			fetchedAt: currentDateTime.toISOString(),
			items: result.items,
			error: null,
		};
	} catch (error) {
		const message = (error instanceof Error ? error.message : 'Unknown error').slice(0, 200);
		PinoLogger.warn({ scope: 'dashboard', message: 'GitHub integration failed', error: message });
		return {
			configurationHash: hash,
			fetchedAt: currentDateTime.toISOString(),
			items: [],
			error: message,
		};
	}
}

async function getPullRequests(settings: DashboardConfig, currentDateTime: Date, forceRefresh: boolean): Promise<CachedPullRequests | null> {
	if (!settings.githubToken) return null;

	if (!forceRefresh) {
		const cached = await Cache.get<CachedPullRequests>(PULL_REQUEST_CACHE_KEY);
		if (cached?.configurationHash === configurationHash(settings)
			&& cached.items.every(item => typeof item.involved === 'boolean')) return cached;
	}

	const fresh = await fetchPullRequests(settings, currentDateTime);
	await Cache.set(PULL_REQUEST_CACHE_KEY, fresh, variables.DASHBOARD_CACHE_TTL_SECONDS);
	return fresh;
}

function buildDashboard(settings: DashboardConfig, pullRequestData: CachedPullRequests | null, currentDateTime: Date): DashboardResponse {
	let githubHealth: IntegrationHealth;
	if (!settings.githubToken) {
		githubHealth = {
			state: 'unconfigured',
			lastSuccessAt: null,
			message: 'Add github configuration to enable this integration.',
		};
	} else if (pullRequestData?.error) {
		githubHealth = {
			state: 'error',
			lastSuccessAt: null,
			message: pullRequestData.error,
		};
	} else {
		githubHealth = {
			state: 'ok',
			lastSuccessAt: pullRequestData?.fetchedAt ?? null,
			message: null,
		};
	}

	const items = pullRequestData?.items ?? [];
	return {
		generatedAt: currentDateTime.toISOString(),
		lastRefreshAt: pullRequestData?.fetchedAt ?? null,
		stale: githubHealth.state === 'error',
		timeZone: settings.timeZone,
		timeFormat: settings.timeFormat ?? '12',
		theme: settings.theme ?? 'light',
		displayName: settings.displayName,
		shortcutLimit: settings.shortcutLimit ?? 8,
		githubTokenConfigured: !!settings.githubToken,
		pullRequests: {
			windowDays: settings.github.windowDays ?? 7,
			counts: calculatePrCounts(items),
			items,
		},
		shortcutGroups: shortcutGroupsFromSettings(settings),
		integrations: { github: githubHealth },
	};
}

async function loadDashboard(db: EntityManager, currentDateTime: Date, forceRefresh: boolean): Promise<DashboardResponse> {
	const settings = await createDashboardRepository(db).getSettings();
	const pullRequests = await getPullRequests(settings, currentDateTime, forceRefresh);
	return buildDashboard(settings, pullRequests, currentDateTime);
}

async function get(db: EntityManager, currentDateTime: Date): Promise<DashboardResponse> {
	return loadDashboard(db, currentDateTime, false);
}

async function refreshPullRequests(db: EntityManager, currentDateTime: Date): Promise<DashboardResponse> {
	return loadDashboard(db, currentDateTime, true);
}

async function settings(db: EntityManager): Promise<DashboardConfig> {
	return createDashboardRepository(db).getSettings();
}

async function githubRepositories(db: EntityManager, refresh: boolean): Promise<GitHubRepositoryCatalog | null> {
	const config = await createDashboardRepository(db).getSettings();
	return config.githubToken ? getGitHubRepositoryCatalog(config.githubToken, refresh) : null;
}

async function updateSettings(db: EntityManager, input: Parameters<ReturnType<typeof createDashboardRepository>['updateSettings']>[0] & { repositoryScopes?: string[] }): Promise<DashboardConfig> {
	const repository = createDashboardRepository(db);
	const updated = await repository.updateSettings(input);
	if (!Array.isArray(input.repositoryScopes)) return updated;
	await repository.setRepositoryScopes(input.repositoryScopes);
	return repository.getSettings();
}

async function addShortcut(db: EntityManager, input: AddShortcutInput) {
	return createDashboardRepository(db).addShortcut(input);
}

async function addShortcuts(db: EntityManager, inputs: AddShortcutInput[]) {
	return createDashboardRepository(db).addShortcuts(inputs);
}

async function updateShortcut(db: EntityManager, id: string, input: { label?: string; url?: string }) {
	return createDashboardRepository(db).updateShortcut(id, input);
}

async function deleteShortcut(db: EntityManager, id: string) {
	return createDashboardRepository(db).deleteShortcut(id);
}

async function reorderShortcuts(db: EntityManager, groupId: string, shortcutIds: string[]) {
	return createDashboardRepository(db).reorderShortcuts(groupId, shortcutIds);
}

async function importShortcuts(db: EntityManager, shortcutGroups: ShortcutGroupConfig[]) {
	return createDashboardRepository(db).importShortcuts(shortcutGroups);
}

export const dashboard = Object.freeze({
	get,
	refreshPullRequests,
	settings,
	githubRepositories,
	updateSettings,
	addShortcut,
	addShortcuts,
	updateShortcut,
	deleteShortcut,
	reorderShortcuts,
	importShortcuts,
});
