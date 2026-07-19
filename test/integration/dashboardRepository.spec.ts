import { describe, expect, it, vi } from 'vitest';
import { createDashboardRepository } from '@/repositories/DashboardRepository';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import type { ShortcutGroupConfig } from '@/types/dashboard';

describe('DashboardRepository shortcut import', () => {
	it('keeps unmatched shortcuts and does not write when imported matches are unchanged', async () => {
		const shortcut = Object.assign(new DashboardShortcut(), {
			id: 'github',
			groupId: 'shortcuts',
			groupLabel: 'Shortcuts',
			label: 'GitHub',
			url: 'https://github.com',
			icon: 'github' as const,
			position: 0,
		});
		const unmatched = Object.assign(new DashboardShortcut(), {
			id: 'jira',
			groupId: 'shortcuts',
			groupLabel: 'Shortcuts',
			label: 'Jira',
			url: 'https://jira.example.com',
			icon: 'jira' as const,
			position: 1,
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
			find: vi.fn().mockResolvedValue([shortcut, unmatched]),
			remove: vi.fn(),
			persist: vi.fn(),
			flush: vi.fn(),
			transactional: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(db)),
		};
		const shortcutGroups: ShortcutGroupConfig[] = [{
			id: 'shortcuts',
			label: 'Shortcuts',
			shortcuts: [{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' }],
		}];

		const config = await createDashboardRepository(db as never).importShortcuts(shortcutGroups);

		expect(config.shortcutGroups).toEqual([{
			id: 'shortcuts',
			label: 'Quick links',
			shortcuts: [
				{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' },
				{ id: 'jira', label: 'Jira', url: 'https://jira.example.com', icon: 'jira' },
			],
		}]);
		expect(db.remove).not.toHaveBeenCalled();
		expect(db.persist).not.toHaveBeenCalled();
		expect(db.flush).not.toHaveBeenCalled();
	});

	it('updates by ID or name, adds new shortcuts, deduplicates, and is idempotent', async () => {
		const stored: DashboardShortcut[] = [
			Object.assign(new DashboardShortcut(), { id: 'github', groupId: 'shortcuts', groupLabel: 'Shortcuts', label: 'Old GitHub', url: 'https://old.github.com', icon: 'link' as const, position: 0 }),
			Object.assign(new DashboardShortcut(), { id: 'calendar-local', groupId: 'shortcuts', groupLabel: 'Shortcuts', label: 'Calendar', url: 'https://calendar.example.com', icon: 'link' as const, position: 1 }),
			Object.assign(new DashboardShortcut(), { id: 'keep', groupId: 'shortcuts', groupLabel: 'Shortcuts', label: 'Keep me', url: 'https://keep.example.com', icon: 'link' as const, position: 2 }),
			Object.assign(new DashboardShortcut(), { id: 'calendar-duplicate', groupId: 'shortcuts', groupLabel: 'Shortcuts', label: 'calendar', url: 'https://duplicate-calendar.example.com', icon: 'calendar' as const, position: 3 }),
		];
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
			find: vi.fn(async () => [...stored]),
			create: vi.fn((_entity: unknown, data: object) => Object.assign(new DashboardShortcut(), data)),
			remove: vi.fn((shortcut: DashboardShortcut) => {
				const index = stored.indexOf(shortcut);
				if (index >= 0) stored.splice(index, 1);
			}),
			persist: vi.fn((shortcuts: DashboardShortcut[]) => stored.push(...shortcuts)),
			flush: vi.fn(),
			transactional: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(db)),
		};
		const shortcutGroups: ShortcutGroupConfig[] = [{
			id: 'shortcuts',
			label: 'Shortcuts',
			shortcuts: [
				{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' },
				{ id: 'calendar-import', label: 'Calendar', url: 'https://team-calendar.example.com', icon: 'calendar' },
				{ id: 'docs', label: 'Docs', url: 'https://docs.example.com', icon: 'link' },
				{ id: 'docs-copy', label: 'docs', url: 'https://duplicate-docs.example.com', icon: 'link' },
			],
		}];

		const first = await createDashboardRepository(db as never).importShortcuts(shortcutGroups);

		expect(first.shortcutGroups[0].shortcuts).toEqual([
			{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' },
			{ id: 'calendar-local', label: 'Calendar', url: 'https://team-calendar.example.com', icon: 'calendar' },
			{ id: 'keep', label: 'Keep me', url: 'https://keep.example.com', icon: 'link' },
			{ id: 'docs', label: 'Docs', url: 'https://docs.example.com', icon: 'link' },
		]);
		expect(db.remove).toHaveBeenCalledTimes(1);
		expect(db.persist).toHaveBeenCalledTimes(1);
		expect(db.flush).toHaveBeenCalledTimes(1);

		const second = await createDashboardRepository(db as never).importShortcuts(shortcutGroups);

		expect(second.shortcutGroups).toEqual(first.shortcutGroups);
		expect(db.remove).toHaveBeenCalledTimes(1);
		expect(db.persist).toHaveBeenCalledTimes(1);
		expect(db.flush).toHaveBeenCalledTimes(1);
	});
});

describe('DashboardRepository general settings', () => {
	it('persists backup frequency and retention', async () => {
		const settings = {
			displayName: 'Albert',
			timeZone: 'Europe/London',
			timeFormat: '12' as const,
			theme: 'light' as const,
			shortcutLimit: 8,
			githubToken: null,
			repositoryScopes: '[]',
			pullRequestWindowDays: 7,
			backupIntervalHours: 24,
			backupRetentionDays: 30,
		};
		const db = {
			findOneOrFail: vi.fn().mockResolvedValue(settings),
			find: vi.fn().mockResolvedValue([]),
			flush: vi.fn().mockResolvedValue(undefined),
		};

		const config = await createDashboardRepository(db as never).updateSettings({
			backupIntervalHours: 6,
			backupRetentionDays: 14,
		});

		expect(settings.backupIntervalHours).toBe(6);
		expect(settings.backupRetentionDays).toBe(14);
		expect(config.backupIntervalHours).toBe(6);
		expect(config.backupRetentionDays).toBe(14);
	});

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
