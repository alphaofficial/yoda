export class DashboardShortcut {
	id!: string;
	groupId!: string;
	groupLabel!: string;
	label!: string;
	url!: string;
	emoji?: string | null;
	position!: number;
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
}
