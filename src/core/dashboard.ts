import { Cache } from '@/primitives/cache';
import { PinoLogger } from '@/logger/pinoLogger';
import { loadDashboardConfig } from '@/config/dashboard';
import { createGitHubClient } from '@/integrations/github';
import { createGoogleCalendarClient } from '@/integrations/calendar';
import variables from '@/config/variables';
import type {
	DashboardResponse,
	PullRequestItem,
	CalendarEventItem,
	ShortcutGroup,
	ShortcutIcon,
	IntegrationHealth,
	DashboardConfig,
} from '@/types/dashboard';
import type { CacheDriver } from '@/primitives/cache';

const FRESH_CACHE_KEY = 'dashboard:fresh';
const LAST_SUCCESS_CACHE_KEY = 'dashboard:last-success';

function calculatePrCounts(items: PullRequestItem[]): { open: number; draft: number; merged: number; closed: number } {
	const counts = { open: 0, draft: 0, merged: 0, closed: 0 };
	for (const item of items) {
		counts[item.state]++;
	}
	return counts;
}

function bucketCalendarEvents(
	items: CalendarEventItem[],
	_timeZone: string,
	now: Date
): { today: CalendarEventItem[]; upcoming: CalendarEventItem[] } {
	const todayDateStr = now.toISOString().split('T')[0];

	const today: CalendarEventItem[] = [];
	const upcoming: CalendarEventItem[] = [];

	for (const item of items) {
		const itemDateStr = item.start.split('T')[0];
		if (itemDateStr === todayDateStr) {
			today.push(item);
		} else {
			upcoming.push(item);
		}
	}

	return { today, upcoming };
}

export interface GitHubClient {
	fetchPullRequests(): Promise<{ items: PullRequestItem[]; unconfigured: boolean }>;
}

export interface CalendarClient {
	fetchEvents(): Promise<{ items: CalendarEventItem[]; unconfigured: boolean }>;
}

export type GitHubClientFactory = (options: {
	token: string;
	repositories: string[];
	fetchImpl?: typeof fetch;
	now?: Date;
}) => GitHubClient;

export type CalendarClientFactory = (options: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	calendarIds: string[];
	timeZone: string;
	lookaheadDays: number;
	fetchImpl?: typeof fetch;
	now?: Date;
}) => CalendarClient;

export interface DashboardService {
	getSnapshot(): Promise<DashboardResponse>;
}

export interface DashboardServiceOptions {
	cacheDriver: CacheDriver;
	fetchImpl?: typeof fetch;
	now?: Date;
	githubClientFactory?: GitHubClientFactory;
	calendarClientFactory?: CalendarClientFactory;
}

export function createDashboardService(options: DashboardServiceOptions): DashboardService {
	const {
		cacheDriver,
		fetchImpl = fetch,
		now = new Date(),
		githubClientFactory = createGitHubClient,
		calendarClientFactory = createGoogleCalendarClient,
	} = options;

	let refreshPromise: Promise<DashboardResponse> | null = null;

	async function getFreshCache(): Promise<DashboardResponse | undefined> {
		return cacheDriver.get<DashboardResponse>(FRESH_CACHE_KEY);
	}

	async function getLastSuccessCache(): Promise<DashboardResponse | undefined> {
		return cacheDriver.get<DashboardResponse>(LAST_SUCCESS_CACHE_KEY);
	}

	async function setFreshCache(value: DashboardResponse): Promise<void> {
		await cacheDriver.set(FRESH_CACHE_KEY, value, variables.DASHBOARD_CACHE_TTL_SECONDS);
	}

	async function setLastSuccessCache(value: DashboardResponse): Promise<void> {
		await cacheDriver.set(LAST_SUCCESS_CACHE_KEY, value);
	}

	async function refresh(config: DashboardConfig, refreshStartTime: Date): Promise<DashboardResponse> {
		const priorSnapshot = await getLastSuccessCache();

		const githubConfigured = !!variables.GITHUB_TOKEN && config.github.repositories.length > 0;
		const calendarConfigured =
			!!variables.GOOGLE_CLIENT_ID &&
			!!variables.GOOGLE_CLIENT_SECRET &&
			!!variables.GOOGLE_REFRESH_TOKEN &&
			config.calendar.calendarIds.length > 0;

		const githubPromise = githubConfigured
			? (async () => {
					try {
						const client = githubClientFactory({
							token: variables.GITHUB_TOKEN!,
							repositories: config.github.repositories,
							fetchImpl,
							now: refreshStartTime,
						});
						const result = await client.fetchPullRequests();
						return { items: result.items, unconfigured: result.unconfigured, error: null };
					} catch (err) {
						const message = err instanceof Error ? err.message : 'Unknown error';
						return { items: [] as PullRequestItem[], unconfigured: false, error: message.slice(0, 200) };
					}
			  })()
			: Promise.resolve({ items: [] as PullRequestItem[], unconfigured: true, error: null });

		const calendarPromise = calendarConfigured
			? (async () => {
					try {
						const client = calendarClientFactory({
							clientId: variables.GOOGLE_CLIENT_ID!,
							clientSecret: variables.GOOGLE_CLIENT_SECRET!,
							refreshToken: variables.GOOGLE_REFRESH_TOKEN!,
							calendarIds: config.calendar.calendarIds,
							timeZone: config.timeZone,
							lookaheadDays: config.calendar.lookaheadDays,
							fetchImpl,
							now: refreshStartTime,
						});
						const result = await client.fetchEvents();
						return { items: result.items, unconfigured: result.unconfigured, error: null };
					} catch (err) {
						const message = err instanceof Error ? err.message : 'Unknown error';
						return { items: [] as CalendarEventItem[], unconfigured: false, error: message.slice(0, 200) };
					}
			  })()
			: Promise.resolve({ items: [] as CalendarEventItem[], unconfigured: true, error: null });

		const [githubResult, calendarResult] = await Promise.all([githubPromise, calendarPromise]);

		if (githubResult.error) {
			PinoLogger.warn({
				scope: 'dashboard',
				message: 'GitHub integration failed',
				error: githubResult.error,
			});
		}

		if (calendarResult.error) {
			PinoLogger.warn({
				scope: 'dashboard',
				message: 'Calendar integration failed',
				error: calendarResult.error,
			});
		}

		let githubHealth: IntegrationHealth;
		let calendarHealth: IntegrationHealth;

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

		if (!calendarConfigured) {
			calendarHealth = {
				state: 'unconfigured',
				lastSuccessAt: null,
				message: 'Add calendar configuration to enable this integration.',
			};
		} else if (calendarResult.error) {
			const priorHealth = priorSnapshot?.integrations.calendar;
			calendarHealth = {
				state: 'error',
				lastSuccessAt: priorHealth?.lastSuccessAt ?? null,
				message: calendarResult.error,
			};
		} else {
			calendarHealth = {
				state: 'ok',
				lastSuccessAt: refreshStartTime.toISOString(),
				message: null,
			};
		}

		const githubItems = githubResult.items;
		const calendarItems = calendarResult.items;

		const pullRequests = {
			windowDays: 7 as const,
			counts: calculatePrCounts(githubItems),
			items: githubItems,
		};

		const { today, upcoming } = bucketCalendarEvents(calendarItems, config.timeZone, refreshStartTime);
		const calendar = { today, upcoming };

		const shortcutGroups: ShortcutGroup[] = config.shortcutGroups.map(group => ({
			id: group.id,
			label: group.label,
			shortcuts: group.shortcuts.map(s => ({
				id: s.id,
				label: s.label,
				url: s.url,
				icon: s.icon as ShortcutIcon,
			})),
		}));

		const stale = githubHealth.state === 'error' || calendarHealth.state === 'error';

		const snapshot: DashboardResponse = {
			generatedAt: refreshStartTime.toISOString(),
			lastRefreshAt: refreshStartTime.toISOString(),
			stale,
			timeZone: config.timeZone,
			displayName: config.displayName,
			pullRequests,
			calendar,
			shortcutGroups,
			integrations: {
				github: githubHealth,
				calendar: calendarHealth,
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
						const config = await loadDashboardConfig(variables.DASHBOARD_CONFIG_PATH);
						return refresh(config, new Date());
					} finally {
						refreshPromise = null;
					}
				})();
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
					const config = await loadDashboardConfig(variables.DASHBOARD_CONFIG_PATH);
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

let dashboardServiceInstance: DashboardService | null = null;

export function getDashboardService(): DashboardService {
	if (!dashboardServiceInstance) {
		dashboardServiceInstance = createDashboardService({ cacheDriver: Cache });
	}
	return dashboardServiceInstance;
}
