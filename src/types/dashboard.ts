export type IntegrationState = 'ok' | 'error' | 'unconfigured';
export type TimeFormat = '12' | '24';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface DashboardResponse {
	generatedAt: string;
	lastRefreshAt: string | null;
	stale: boolean;
	timeZone: string;
	timeFormat?: TimeFormat;
	theme?: ThemePreference;
	displayName: string;
	shortcutLimit?: number;
	githubTokenConfigured?: boolean;
	pullRequests: {
		windowDays: number;
		counts: { open: number; draft: number; merged: number; closed: number };
		items: PullRequestItem[];
	};
	shortcutGroups: ShortcutGroup[];
	integrations: {
		github: IntegrationHealth;
	};
}

export interface IntegrationHealth {
	state: IntegrationState;
	lastSuccessAt: string | null;
	message: string | null;
}

export interface PullRequestItem {
	id: string;
	repository: string;
	number: number;
	title: string;
	author: string;
	involved: boolean;
	state: 'open' | 'draft' | 'merged' | 'closed';
	createdAt: string;
	updatedAt: string;
	url: string;
	labels: string[];
}

export interface GitHubRepository {
	id: number;
	name: string;
	fullName: string;
	owner: string;
	ownerType: 'User' | 'Organization';
	private: boolean;
	archived: boolean;
}

export interface GitHubRepositoryCatalog {
	viewerLogin: string;
	repositories: GitHubRepository[];
	defaultScopes: string[];
	teams: string[];
}

export interface GitHubPullRequestContext {
	viewerLogin: string;
	teams: string[];
	ownerTypes: Record<string, 'User' | 'Organization'>;
}

export interface ShortcutGroup {
	id: string;
	label: string;
	shortcuts: ShortcutItem[];
}

export interface ShortcutItem {
	id: string;
	label: string;
	url: string;
	icon: ShortcutIcon;
}

export type ShortcutIcon = 'calendar' | 'github' | 'jira' | 'link' | 'obsidian';

export interface ShortcutGroupConfig {
	id: string;
	label: string;
	shortcuts: ShortcutConfig[];
}

export interface ShortcutConfig {
	id: string;
	label: string;
	url: string;
	icon: ShortcutIcon;
}

export interface DashboardConfig {
	displayName: string;
	timeZone: string;
	timeFormat?: TimeFormat;
	theme?: ThemePreference;
	shortcutLimit?: number;
	backupIntervalHours?: number;
	backupRetentionDays?: number;
	githubToken?: string | null;
	github: {
		repositoryScopes: string[];
		windowDays: number;
	};
	shortcutGroups: ShortcutGroupConfig[];
}

export interface ShortcutSettingsExport {
	version: 1;
	exportedAt: string;
	shortcutGroups: ShortcutGroupConfig[];
}

export interface AddShortcutInput {
	groupId: string;
	label: string;
	url: string;
	icon: ShortcutIcon;
	position?: number;
}

export class DashboardConfigError extends Error {
	constructor(
		message: string,
		public readonly fields?: Record<string, string>
	) {
		super(message);
		this.name = 'DashboardConfigError';
	}
}

export class ShortcutValidationError extends Error {
	constructor(
		message: string,
		public readonly fields?: Record<string, string>
	) {
		super(message);
		this.name = 'ShortcutValidationError';
	}
}
