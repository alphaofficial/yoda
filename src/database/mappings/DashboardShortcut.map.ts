import { EntitySchema } from '@mikro-orm/core';
import { DashboardShortcut } from '@/models/DashboardShortcut';

export const DashboardShortcutMapper = new EntitySchema<DashboardShortcut>({
	class: DashboardShortcut,
	tableName: 'dashboard_shortcuts',
	properties: {
		id: { type: 'string', primary: true },
		groupId: { type: 'string', fieldName: 'group_id' },
		groupLabel: { type: 'string', fieldName: 'group_label' },
		label: { type: 'string' },
		url: { type: 'string' },
		position: { type: 'number' },
		createdAt: { type: 'Date', fieldName: 'created_at', defaultRaw: 'CURRENT_TIMESTAMP' },
		updatedAt: { type: 'Date', fieldName: 'updated_at', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() },
	},
	indexes: [
		{ name: 'dashboard_shortcuts_group_position_index', properties: ['groupId', 'position'] },
	],
});
