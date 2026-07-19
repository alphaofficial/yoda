export class DashboardSettings {
	id!: string;
	displayName!: string;
	timeZone!: string;
	shortcutLimit!: number;
	pullRequestWindowDays!: number;
	backupIntervalHours!: number;
	backupRetentionDays!: number;
	timeFormat!: '12' | '24';
	theme!: 'light' | 'dark' | 'system';
	githubToken?: string | null;
	repositoryScopes!: string;
	pullRequestFilters!: string;
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
}
