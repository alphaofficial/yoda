import { describe, expect, it, vi } from 'vitest';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import type { ShortcutGroupConfig } from '@/types/dashboard';

describe('DashboardConfigRepository shortcut import', () => {
	it('does not rewrite shortcuts when the imported data is unchanged', async () => {
		const shortcut = Object.assign(new DashboardShortcut(), {
			id: 'github',
			groupId: 'shortcuts',
			groupLabel: 'Shortcuts',
			label: 'GitHub',
			url: 'https://github.com',
			icon: 'github' as const,
			position: 0,
		});
		const settings = {
			displayName: 'Albert',
			timeZone: 'Europe/London',
			shortcutLimit: 8,
			githubToken: null,
			repositories: '[]',
			pullRequestWindowDays: 7,
		};
		const db = {
			findOneOrFail: vi.fn().mockResolvedValue(settings),
			find: vi.fn().mockResolvedValue([shortcut]),
			nativeDelete: vi.fn(),
			flush: vi.fn(),
			transactional: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(db)),
		};
		const shortcutGroups: ShortcutGroupConfig[] = [{
			id: 'shortcuts',
			label: 'Shortcuts',
			shortcuts: [{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' }],
		}];

		const config = await new DashboardConfigRepository(db as never).importShortcuts(shortcutGroups);

		expect(config.shortcutGroups).toEqual(shortcutGroups);
		expect(db.nativeDelete).not.toHaveBeenCalled();
		expect(db.flush).not.toHaveBeenCalled();
	});
});
