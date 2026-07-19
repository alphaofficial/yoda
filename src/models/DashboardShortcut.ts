export class DashboardShortcut {
	id!: string;
	groupId!: string;
	groupLabel!: string;
	label!: string;
	url!: string;
	position!: number;
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
}
