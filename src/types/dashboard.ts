export type IntegrationState = 'ok' | 'error' | 'unconfigured';
export type ReviewState = 'approved' | 'changes_requested' | 'review_required' | 'draft';

export interface DashboardResponse {
	generatedAt: string;
	lastRefreshAt: string | null;
	stale: boolean;
	timeZone: string;
	displayName: string;
	pullRequests: {
		windowDays: 7;
		counts: { open: number; draft: number; merged: number; closed: number };
		items: PullRequestItem[];
	};
	calendar: { today: CalendarEventItem[]; upcoming: CalendarEventItem[] };
	shortcutGroups: ShortcutGroup[];
	integrations: {
		github: IntegrationHealth;
		calendar: IntegrationHealth;
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

export interface CalendarEventItem {
	id: string;
	calendarId: string;
	calendarName: string;
	title: string;
	start: string;
	end: string;
	allDay: boolean;
	url: string | null;
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
	github: {
		repositories: string[];
	};
	calendar: {
		calendarIds: string[];
		lookaheadDays: number;
	};
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
