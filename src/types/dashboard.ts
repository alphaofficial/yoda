export type IntegrationState = 'ok' | 'error' | 'unconfigured';
export type ReviewState = 'approved' | 'changes_requested' | 'review_required' | 'draft';

export interface DashboardResponse {
	generatedAt: string;
	lastRefreshAt: string | null;
	stale: boolean;
	timeZone: string;
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
	reviewState: ReviewState;
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
	shortcutLimit?: number;
	githubToken?: string | null;
	github: {
		repositories: string[];
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
