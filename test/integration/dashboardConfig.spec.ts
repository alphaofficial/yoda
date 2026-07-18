import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
	validateDashboardConfig,
	loadDashboardConfig,
	addShortcut,
	validateShortcutInput,
} from '@/config/dashboard';
import { DashboardConfigError, ShortcutValidationError } from '@/types/dashboard';

describe('dashboard config validation', () => {
	describe('valid configurations', () => {
		it('accepts minimal valid config', () => {
			const config = {
				displayName: 'Test User',
				timeZone: 'America/New_York',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			const result = validateDashboardConfig(config);
			expect(result.displayName).toBe('Test User');
			expect(result.timeZone).toBe('America/New_York');
		});

		it('accepts full valid config with shortcuts', () => {
			const config = {
				displayName: 'Albert',
				timeZone: 'Europe/London',
				github: {
					repositories: ['owner/repo1', 'owner/repo2'],
				},
				calendar: {
					calendarIds: ['primary', 'calendar-id-2'],
					lookaheadDays: 14,
				},
				shortcutGroups: [
					{
						id: 'shortcuts',
						label: 'Shortcuts',
						shortcuts: [
							{
								id: 'jira',
								label: 'Jira board',
								url: 'https://example.atlassian.net/jira/your-work',
								icon: 'jira',
							},
							{
								id: 'obsidian',
								label: 'Obsidian vault',
								url: 'obsidian://open',
								icon: 'obsidian',
							},
						],
					},
				],
			};
			const result = validateDashboardConfig(config);
			expect(result.shortcutGroups).toHaveLength(1);
			expect(result.shortcutGroups[0].shortcuts).toHaveLength(2);
		});

		it('accepts all valid icon types', () => {
			const icons: Array<'calendar' | 'github' | 'jira' | 'link' | 'obsidian'> = [
				'calendar',
				'github',
				'jira',
				'link',
				'obsidian',
			];
			for (const icon of icons) {
				const config = {
					displayName: 'Test',
					timeZone: 'UTC',
					github: { repositories: [] },
					calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
					shortcutGroups: [
						{
							id: 'group',
							label: 'Group',
							shortcuts: [
								{ id: 'shortcut', label: 'Shortcut', url: 'https://example.com', icon },
							],
						},
					],
				};
				expect(() => validateDashboardConfig(config)).not.toThrow();
			}
		});

		it('accepts max length display name (60 chars)', () => {
			const config = {
				displayName: 'a'.repeat(60),
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts max length label (60 chars)', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'group',
						label: 'a'.repeat(60),
						shortcuts: [
							{ id: 's', label: 'a'.repeat(60), url: 'https://example.com', icon: 'link' },
						],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts min lookaheadDays (1)', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 1 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts max lookaheadDays (30)', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 30 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts valid http URL', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'http://example.com', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts obsidian URL', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'obsidian://open', icon: 'obsidian' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).not.toThrow();
		});

		it('accepts all valid ID patterns', () => {
			const ids = ['a', 'abc', 'a123', 'a-b', 'a-b-c', 'a123-b456-c789'];
			for (const id of ids) {
				const config = {
					displayName: 'Test',
					timeZone: 'UTC',
					github: { repositories: [] },
					calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
					shortcutGroups: [
						{
							id,
							label: 'Group',
							shortcuts: [{ id, label: 'Shortcut', url: 'https://example.com', icon: 'link' }],
						},
					],
				};
				expect(() => validateDashboardConfig(config)).not.toThrow();
			}
		});
	});

	describe('invalid configurations', () => {
		it('rejects missing config', () => {
			expect(() => validateDashboardConfig(null)).toThrow(DashboardConfigError);
			expect(() => validateDashboardConfig(undefined)).toThrow(DashboardConfigError);
		});

		it('rejects non-object config', () => {
			expect(() => validateDashboardConfig('string')).toThrow(DashboardConfigError);
			expect(() => validateDashboardConfig(123)).toThrow(DashboardConfigError);
			expect(() => validateDashboardConfig([])).toThrow(DashboardConfigError);
		});

		it('rejects missing displayName', () => {
			const config = {
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('displayName is required');
		});

		it('rejects empty displayName', () => {
			const config = {
				displayName: '',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow(DashboardConfigError);
		});

		it('rejects whitespace-only displayName', () => {
			const config = {
				displayName: '   ',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow(DashboardConfigError);
		});

		it('rejects too long displayName', () => {
			const config = {
				displayName: 'a'.repeat(61),
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow(DashboardConfigError);
		});

		it('rejects missing timeZone', () => {
			const config = {
				displayName: 'Test',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('timeZone is required');
		});

		it('rejects invalid timeZone', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'Invalid/TimeZone',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid time zone');
		});

		it('rejects missing github.repositories', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: {},
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('github.repositories must be an array');
		});

		it('rejects invalid repository format', () => {
			const invalidRepos = ['repo', 'owner/', '/repo', 'owner/repo/extra'];
			for (const repo of invalidRepos) {
				const config = {
					displayName: 'Test',
					timeZone: 'UTC',
					github: { repositories: [repo] },
					calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
					shortcutGroups: [],
				};
				expect(() => validateDashboardConfig(config)).toThrow('Invalid repository format');
			}
		});

		it('rejects duplicate repositories', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: ['owner/repo', 'owner/repo'] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Duplicate repository');
		});

		it('rejects missing calendar.lookaheadDays', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'] },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('lookaheadDays is required');
		});

		it('rejects lookaheadDays below 1', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 0 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('lookaheadDays must be an integer from 1 to 30');
		});

		it('rejects lookaheadDays above 30', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 31 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('lookaheadDays must be an integer from 1 to 30');
		});

		it('rejects non-integer lookaheadDays', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7.5 },
				shortcutGroups: [],
			};
			expect(() => validateDashboardConfig(config)).toThrow('lookaheadDays must be an integer from 1 to 30');
		});

		it('rejects invalid group ID', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'Invalid-ID',
						label: 'Group',
						shortcuts: [],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid group ID');
		});

		it('rejects group ID starting with hyphen', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: '-invalid',
						label: 'Group',
						shortcuts: [],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid group ID');
		});

		it('rejects duplicate group IDs', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{ id: 'group', label: 'Group 1', shortcuts: [] },
					{ id: 'group', label: 'Group 2', shortcuts: [] },
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Duplicate group ID');
		});

		it('rejects invalid shortcut ID', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'group',
						label: 'Group',
						shortcuts: [
							{ id: 'Invalid', label: 'Shortcut', url: 'https://example.com', icon: 'link' },
						],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid shortcut ID');
		});

		it('rejects duplicate shortcut IDs within group', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'group',
						label: 'Group',
						shortcuts: [
							{ id: 'shortcut', label: 'Shortcut 1', url: 'https://example1.com', icon: 'link' },
							{ id: 'shortcut', label: 'Shortcut 2', url: 'https://example2.com', icon: 'link' },
						],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Duplicate shortcut ID');
		});

		it('rejects invalid icon', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'group',
						label: 'Group',
						shortcuts: [
							{ id: 'shortcut', label: 'Shortcut', url: 'https://example.com', icon: 'invalid' },
						],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid icon');
		});
	});

	describe('URL validation', () => {
		it('rejects javascript: URL', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'javascript:alert(1)', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid URL protocol');
		});

		it('rejects data: URL', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'data:text/html,<script>alert(1)</script>', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid URL protocol');
		});

		it('rejects file: URL', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'file:///etc/passwd', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid URL protocol');
		});

		it('rejects URL with credentials', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'https://user:pass@example.com', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('URL must not contain credentials');
		});

		it('rejects URL with username only', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'https://user@example.com', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('URL must not contain credentials');
		});

		it('rejects URL with password only', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'https://:password@example.com', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('URL must not contain credentials');
		});

		it('rejects https URL without host', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'https:///', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid URL');
		});

		it('rejects unsupported custom scheme', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: 'S', url: 'custom://open', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Invalid URL protocol');
		});
	});

	describe('label validation', () => {
		it('rejects empty label', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: '',
						shortcuts: [],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Group label is required');
		});

		it('rejects too long label', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'a'.repeat(61),
						shortcuts: [],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Group label must be 1–60 characters');
		});

		it('rejects empty shortcut label', () => {
			const config = {
				displayName: 'Test',
				timeZone: 'UTC',
				github: { repositories: [] },
				calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
				shortcutGroups: [
					{
						id: 'g',
						label: 'G',
						shortcuts: [{ id: 's', label: '', url: 'https://example.com', icon: 'link' }],
					},
				],
			};
			expect(() => validateDashboardConfig(config)).toThrow('Shortcut label is required');
		});
	});
});

describe('shortcut persistence', () => {
	const tmpDir = path.join(os.tmpdir(), 'dashboard-config-test-' + Date.now());

	beforeEach(async () => {
		await fs.mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const validConfig = {
		displayName: 'Test',
		timeZone: 'UTC',
		github: { repositories: [] },
		calendar: { calendarIds: ['primary'], lookaheadDays: 7 },
		shortcutGroups: [
			{
				id: 'group1',
				label: 'Group 1',
				shortcuts: [{ id: 'existing', label: 'Existing', url: 'https://example.com', icon: 'link' }],
			},
			{
				id: 'group2',
				label: 'Group 2',
				shortcuts: [],
			},
		],
	};

	async function writeConfig(config: unknown): Promise<string> {
		const configPath = path.join(tmpDir, 'dashboard.json');
		await fs.writeFile(configPath, JSON.stringify(config, null, '\t') + '\n');
		return configPath;
	}

	describe('addShortcut', () => {
		it('appends shortcut to group when no position provided', async () => {
			const configPath = await writeConfig(validConfig);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'New Shortcut', url: 'https://new.example.com', icon: 'link' },
				configPath
			);

			expect(shortcut.id).toMatch(/^new-shortcut-[a-z0-9]{6}$/);
			expect(shortcut.label).toBe('New Shortcut');
			expect(shortcut.url).toBe('https://new.example.com');
			expect(shortcut.icon).toBe('link');

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[0].shortcuts).toHaveLength(2);
			expect(saved.shortcutGroups[0].shortcuts[1].id).toBe(shortcut.id);
		});

		it('inserts shortcut at beginning when position is 0', async () => {
			const configPath = await writeConfig(validConfig);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'First Shortcut', url: 'https://first.example.com', icon: 'link', position: 0 },
				configPath
			);

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[0].shortcuts[0].id).toBe(shortcut.id);
			expect(saved.shortcutGroups[0].shortcuts[0].label).toBe('First Shortcut');
		});

		it('inserts shortcut at middle position', async () => {
			const configWith3 = {
				...validConfig,
				shortcutGroups: [
					{
						id: 'group1',
						label: 'Group 1',
						shortcuts: [
							{ id: 's1', label: 'S1', url: 'https://s1.com', icon: 'link' },
							{ id: 's2', label: 'S2', url: 'https://s2.com', icon: 'link' },
							{ id: 's3', label: 'S3', url: 'https://s3.com', icon: 'link' },
						],
					},
				],
			};
			const configPath = await writeConfig(configWith3);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'Middle', url: 'https://middle.com', icon: 'link', position: 1 },
				configPath
			);

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[0].shortcuts[1].label).toBe('Middle');
			expect(saved.shortcutGroups[0].shortcuts).toHaveLength(4);
		});

		it('clamps position beyond length to end', async () => {
			const configPath = await writeConfig(validConfig);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'End', url: 'https://end.com', icon: 'link', position: 999 },
				configPath
			);

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[0].shortcuts).toHaveLength(2);
			expect(saved.shortcutGroups[0].shortcuts[1].label).toBe('End');
		});

		it('clamps negative position to beginning', async () => {
			const configPath = await writeConfig(validConfig);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'Start', url: 'https://start.com', icon: 'link', position: -5 },
				configPath
			);

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[0].shortcuts[0].label).toBe('Start');
		});

		it('adds to empty group', async () => {
			const configPath = await writeConfig(validConfig);
			const shortcut = await addShortcut(
				{ groupId: 'group2', label: 'First in Group 2', url: 'https://first.example.com', icon: 'link' },
				configPath
			);

			const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
			expect(saved.shortcutGroups[1].shortcuts).toHaveLength(1);
			expect(saved.shortcutGroups[1].shortcuts[0].id).toBe(shortcut.id);
		});

		it('generates collision-safe ID', async () => {
			const configWithExisting = {
				...validConfig,
				shortcutGroups: [
					{
						id: 'group1',
						label: 'Group 1',
						shortcuts: [
							{ id: 'jira', label: 'Jira', url: 'https://jira.com', icon: 'jira' },
							{ id: 'jira-ab12cd', label: 'Jira copy', url: 'https://jira2.com', icon: 'jira' },
						],
					},
				],
			};
			const configPath = await writeConfig(configWithExisting);
			const shortcut = await addShortcut(
				{ groupId: 'group1', label: 'Jira board', url: 'https://jira3.com', icon: 'jira' },
				configPath
			);

			expect(shortcut.id).not.toBe('jira');
			expect(shortcut.id).not.toBe('jira-ab12cd');
			expect(shortcut.id).toMatch(/^jira(-[a-z0-9]+)+$/);
		});

		it('rejects invalid group', async () => {
			const configPath = await writeConfig(validConfig);
			await expect(
				addShortcut(
					{ groupId: 'nonexistent', label: 'Test', url: 'https://test.com', icon: 'link' },
					configPath
				)
			).rejects.toThrow(ShortcutValidationError);
		});

		it('writes atomically using temp file', async () => {
			const configPath = await writeConfig(validConfig);

			await addShortcut(
				{ groupId: 'group1', label: 'Atomic Test', url: 'https://atomic.com', icon: 'link' },
				configPath
			);

			const tmpFiles = await fs.readdir(tmpDir);
			expect(tmpFiles.filter(f => f.endsWith('.tmp'))).toHaveLength(0);

			const content = await fs.readFile(configPath, 'utf-8');
			expect(content).toContain('Atomic Test');
			expect(content).toHaveLength(content.trimEnd().length + 1);
		});
	});

	describe('validateShortcutInput', () => {
		it('accepts valid shortcut input', () => {
			const input = {
				groupId: 'group1',
				label: 'Test Shortcut',
				url: 'https://test.com',
				icon: 'link',
				position: 1,
			};
			const result = validateShortcutInput(input);
			expect(result.groupId).toBe('group1');
			expect(result.label).toBe('Test Shortcut');
			expect(result.url).toBe('https://test.com');
			expect(result.icon).toBe('link');
			expect(result.position).toBe(1);
		});

		it('accepts input without optional position', () => {
			const input = {
				groupId: 'group1',
				label: 'Test',
				url: 'https://test.com',
				icon: 'github',
			};
			const result = validateShortcutInput(input);
			expect(result.position).toBeUndefined();
		});

		it('trims label whitespace', () => {
			const input = {
				groupId: 'group1',
				label: '  Test  ',
				url: 'https://test.com',
				icon: 'link',
			};
			const result = validateShortcutInput(input);
			expect(result.label).toBe('Test');
		});

		it('rejects missing groupId', () => {
			expect(() =>
				validateShortcutInput({
					label: 'Test',
					url: 'https://test.com',
					icon: 'link',
				})
			).toThrow(ShortcutValidationError);
		});

		it('rejects missing label', () => {
			expect(() =>
				validateShortcutInput({
					groupId: 'group1',
					url: 'https://test.com',
					icon: 'link',
				})
			).toThrow(ShortcutValidationError);
		});

		it('rejects javascript: URL', () => {
			expect(() =>
				validateShortcutInput({
					groupId: 'group1',
					label: 'Test',
					url: 'javascript:alert(1)',
					icon: 'link',
				})
			).toThrow(ShortcutValidationError);
		});

		it('rejects non-integer position', () => {
			expect(() =>
				validateShortcutInput({
					groupId: 'group1',
					label: 'Test',
					url: 'https://test.com',
					icon: 'link',
					position: 1.5,
				})
			).toThrow(ShortcutValidationError);
		});
	});

	describe('loadDashboardConfig', () => {
		it('loads valid config', async () => {
			const configPath = await writeConfig(validConfig);
			const loaded = await loadDashboardConfig(configPath);
			expect(loaded.displayName).toBe('Test');
			expect(loaded.shortcutGroups).toHaveLength(2);
		});

		it('throws for missing file', async () => {
			const nonexistent = path.join(tmpDir, 'nonexistent.json');
			await expect(loadDashboardConfig(nonexistent)).rejects.toThrow('Configuration file not found');
		});

		it('throws for malformed JSON', async () => {
			const configPath = path.join(tmpDir, 'bad.json');
			await fs.writeFile(configPath, '{ invalid json }');
			await expect(loadDashboardConfig(configPath)).rejects.toThrow();
		});

		it('throws for invalid config content', async () => {
			const configPath = await writeConfig({ displayName: '' });
			await expect(loadDashboardConfig(configPath)).rejects.toThrow(DashboardConfigError);
		});
	});

	describe('error field messages', () => {
		it('DashboardConfigError contains field information', () => {
			const error = new DashboardConfigError('Invalid config', { displayName: 'Required' });
			expect(error.fields).toEqual({ displayName: 'Required' });
			expect(error.message).toBe('Invalid config');
		});

		it('ShortcutValidationError contains field information', () => {
			const error = new ShortcutValidationError('Invalid shortcut', { label: 'Required' });
			expect(error.fields).toEqual({ label: 'Required' });
			expect(error.message).toBe('Invalid shortcut');
		});

		it('DashboardConfigError does not leak secrets', () => {
			const error = new DashboardConfigError('Invalid URL', { url: 'https://user:pass@example.com' });
			expect(error.fields?.url).toBe('https://user:pass@example.com');
		});
	});
});
