export class DashboardSettings {
	id!: string;
	displayName!: string;
	timeZone!: string;
	shortcutLimit!: number;
	pullRequestWindowDays!: number;
	githubToken?: string | null;
	repositories!: string;
	pullRequestFilters!: string;
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
}
