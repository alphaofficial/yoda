import { Cache } from '@/primitives/cache';
import { PinoLogger } from '@/logger/pinoLogger';
import { createGitHubClient } from '@/integrations/github';
import { httpClient, type HttpClient } from '@/integrations/http';
import variables from '@/config/variables';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import type {
	DashboardResponse,
	PullRequestItem,
	ShortcutGroup,
	ShortcutIcon,
	IntegrationHealth,
	DashboardConfig,
} from '@/types/dashboard';

const FRESH_CACHE_KEY = 'dashboard:fresh';
const LAST_SUCCESS_CACHE_KEY = 'dashboard:last-success';

function calculatePrCounts(items: PullRequestItem[]): { open: number; draft: number; merged: number; closed: number } {
	const counts = { open: 0, draft: 0, merged: 0, closed: 0 };
	for (const item of items) {
		counts[item.state]++;
	}
	return counts;
}

function shortcutGroupsFromConfig(config: DashboardConfig): ShortcutGroup[] {
	return config.shortcutGroups.map(group => ({
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

function localSnapshot(config: DashboardConfig, prior?: DashboardResponse): DashboardResponse {
	const now = new Date().toISOString();
	const githubTokenConfigured = !!config.githubToken;
	return {
		generatedAt: now,
		lastRefreshAt: prior?.lastRefreshAt ?? null,
		stale: true,
		timeZone: config.timeZone,
		displayName: config.displayName,
		shortcutLimit: config.shortcutLimit ?? 8,
		githubTokenConfigured,
		pullRequests: {
			windowDays: config.github.windowDays ?? 7,
			counts: prior?.pullRequests.counts ?? { open: 0, draft: 0, merged: 0, closed: 0 },
			items: prior?.pullRequests.items ?? [],
		},
		shortcutGroups: shortcutGroupsFromConfig(config),
		integrations: {
			github: githubTokenConfigured
				? prior?.integrations.github ?? { state: 'ok', lastSuccessAt: null, message: 'Refreshing GitHub data.' }
				: { state: 'unconfigured', lastSuccessAt: null, message: 'Add github configuration to enable this integration.' },
		},
	};
}

export async function primeDashboardSnapshot(config: DashboardConfig): Promise<void> {
	const prior = await Cache.get<DashboardResponse>(LAST_SUCCESS_CACHE_KEY);
	if (!prior) await Cache.set(LAST_SUCCESS_CACHE_KEY, localSnapshot(config));
}

export async function invalidateDashboardSnapshot(config: DashboardConfig): Promise<void> {
	const prior = await Cache.get<DashboardResponse>(LAST_SUCCESS_CACHE_KEY);
	await Cache.set(LAST_SUCCESS_CACHE_KEY, localSnapshot(config, prior));
	await Cache.delete(FRESH_CACHE_KEY);
}

export interface GitHubClient {
	fetchPullRequests(): Promise<{ items: PullRequestItem[]; unconfigured: boolean }>;
}

export type GitHubClientFactory = (options: {
	token: string;
	repositories: string[];
	windowDays?: number;
	httpClient?: HttpClient;
	now?: Date;
}) => GitHubClient;

export interface DashboardService {
	getSnapshot(): Promise<DashboardResponse>;
}

export interface DashboardServiceOptions {
	configRepository: DashboardConfigRepository;
	httpClient?: HttpClient;
	now?: Date;
	githubClientFactory?: GitHubClientFactory;
}

interface GitHubFetchResult {
	items: PullRequestItem[];
	error: string | null;
}

export function createDashboardService(options: DashboardServiceOptions): DashboardService {
	const {
		configRepository,
		now = new Date(),
		githubClientFactory = createGitHubClient,
	} = options;
	const apiClient = options.httpClient ?? httpClient;

	let refreshPromise: Promise<DashboardResponse> | null = null;

	async function getFreshCache(): Promise<DashboardResponse | undefined> {
		return Cache.get<DashboardResponse>(FRESH_CACHE_KEY);
	}

	async function getLastSuccessCache(): Promise<DashboardResponse | undefined> {
		return Cache.get<DashboardResponse>(LAST_SUCCESS_CACHE_KEY);
	}

	async function setFreshCache(value: DashboardResponse): Promise<void> {
		await Cache.set(FRESH_CACHE_KEY, value, variables.DASHBOARD_CACHE_TTL_SECONDS);
	}

	async function setLastSuccessCache(value: DashboardResponse): Promise<void> {
		await Cache.set(LAST_SUCCESS_CACHE_KEY, value);
	}

	async function fetchGitHubPullRequests(config: DashboardConfig, requestedAt: Date): Promise<GitHubFetchResult> {
		if (!config.githubToken) return { items: [], error: null };

		try {
			const githubClient = githubClientFactory({
				token: config.githubToken,
				repositories: config.github.repositories,
				windowDays: config.github.windowDays ?? 7,
				httpClient: apiClient,
				now: requestedAt,
			});
			const result = await githubClient.fetchPullRequests();
			return { items: result.items, error: null };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { items: [], error: message.slice(0, 200) };
		}
	}

	async function refresh(config: DashboardConfig, refreshStartTime: Date): Promise<DashboardResponse> {
		const priorSnapshot = await getLastSuccessCache();

		const githubToken = config.githubToken;
		const githubConfigured = !!githubToken;
		const pullRequestWindowDays = config.github.windowDays ?? 7;
		const githubResult = await fetchGitHubPullRequests(config, refreshStartTime);

		if (githubResult.error) {
			PinoLogger.warn({
				scope: 'dashboard',
				message: 'GitHub integration failed',
				error: githubResult.error,
			});
		}

		let githubHealth: IntegrationHealth;

		if (!githubConfigured) {
			githubHealth = {
				state: 'unconfigured',
				lastSuccessAt: null,
				message: 'Add github configuration to enable this integration.',
			};
		} else if (githubResult.error) {
			const priorHealth = priorSnapshot?.integrations.github;
			githubHealth = {
				state: 'error',
				lastSuccessAt: priorHealth?.lastSuccessAt ?? null,
				message: githubResult.error,
			};
		} else {
			githubHealth = {
				state: 'ok',
				lastSuccessAt: refreshStartTime.toISOString(),
				message: null,
			};
		}

		const githubItems = githubResult.items;

		const pullRequests = {
			windowDays: pullRequestWindowDays,
			counts: calculatePrCounts(githubItems),
			items: githubItems,
		};

		const shortcutGroups = shortcutGroupsFromConfig(config);

		const stale = githubHealth.state === 'error';

		const snapshot: DashboardResponse = {
			generatedAt: refreshStartTime.toISOString(),
			lastRefreshAt: refreshStartTime.toISOString(),
			stale,
			timeZone: config.timeZone,
			displayName: config.displayName,
			shortcutLimit: config.shortcutLimit ?? 8,
			githubTokenConfigured: !!githubToken,
			pullRequests,
			shortcutGroups,
			integrations: {
				github: githubHealth,
			},
		};

		await Promise.all([setFreshCache(snapshot), setLastSuccessCache(snapshot)]);

		return snapshot;
	}

	async function getSnapshot(): Promise<DashboardResponse> {
		const fresh = await getFreshCache();
		if (fresh) {
			return {
				...fresh,
				generatedAt: now.toISOString(),
				stale: false,
			};
		}

		const lastSuccess = await getLastSuccessCache();
		if (lastSuccess) {
			if (!refreshPromise) {
				refreshPromise = (async () => {
					try {
						const config = await configRepository.getConfig();
						return refresh(config, new Date());
					} finally {
						refreshPromise = null;
					}
				})();
				void refreshPromise.catch(err => PinoLogger.warn({ scope: 'dashboard', message: 'Background refresh failed', error: err instanceof Error ? err.message : 'Unknown error' }));
			}

			return {
				...lastSuccess,
				generatedAt: now.toISOString(),
				stale: true,
			};
		}

		if (!refreshPromise) {
			refreshPromise = (async () => {
				try {
					const config = await configRepository.getConfig();
					return refresh(config, new Date());
				} finally {
					refreshPromise = null;
				}
			})();
		}

		return refreshPromise;
	}

	return { getSnapshot };
}
