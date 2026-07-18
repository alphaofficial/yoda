import type { ShortcutIcon } from '@/types/dashboard';

export class DashboardShortcut {
	id!: string;
	groupId!: string;
	groupLabel!: string;
	label!: string;
	url!: string;
	icon!: ShortcutIcon;
	position!: number;
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
}
