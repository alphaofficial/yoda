import { describe, expect, it, vi } from 'vitest';
import { createDashboardRepository } from '@/repositories/DashboardRepository';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import type { ShortcutGroupConfig } from '@/types/dashboard';

describe('DashboardRepository shortcut import', () => {
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
			repositoryScopes: '[]',
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

		const config = await createDashboardRepository(db as never).importShortcuts(shortcutGroups);

		expect(config.shortcutGroups).toEqual(shortcutGroups);
		expect(db.nativeDelete).not.toHaveBeenCalled();
		expect(db.flush).not.toHaveBeenCalled();
	});
});

describe('DashboardRepository general settings', () => {
	it('persists the selected time format', async () => {
		const settings = {
			displayName: 'Albert',
			timeZone: 'Europe/London',
			timeFormat: '12' as '12' | '24',
			theme: 'light' as 'light' | 'dark' | 'system',
			shortcutLimit: 8,
			githubToken: null,
			repositoryScopes: '[]',
			pullRequestWindowDays: 7,
		};
		const db = {
			findOneOrFail: vi.fn().mockResolvedValue(settings),
			find: vi.fn().mockResolvedValue([]),
			flush: vi.fn().mockResolvedValue(undefined),
		};

		const config = await createDashboardRepository(db as never).updateSettings({ timeFormat: '24' });

		expect(settings.timeFormat).toBe('24');
		expect(config.timeFormat).toBe('24');
		expect(db.flush).toHaveBeenCalledOnce();
	});

	it('persists the selected theme', async () => {
		const settings = {
			displayName: 'Albert',
			timeZone: 'Europe/London',
			timeFormat: '12' as const,
			theme: 'light' as 'light' | 'dark' | 'system',
			shortcutLimit: 8,
			githubToken: null,
			repositoryScopes: '[]',
			pullRequestWindowDays: 7,
		};
		const db = {
			findOneOrFail: vi.fn().mockResolvedValue(settings),
			find: vi.fn().mockResolvedValue([]),
			flush: vi.fn().mockResolvedValue(undefined),
		};

		const config = await createDashboardRepository(db as never).updateSettings({ theme: 'dark' });

		expect(settings.theme).toBe('dark');
		expect(config.theme).toBe('dark');
		expect(db.flush).toHaveBeenCalledOnce();
	});
});
