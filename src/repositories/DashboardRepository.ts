import { randomUUID } from 'crypto';
import { EntityManager } from '@mikro-orm/core';
import { loadDashboardConfig, validateShortcutInput } from '@/config/dashboard';
import variables from '@/config/variables';
import { DashboardSettings } from '@/models/DashboardSettings';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import { ShortcutValidationError } from '@/types/dashboard';
import type { AddShortcutInput, DashboardConfig, ShortcutConfig, ShortcutGroupConfig, ShortcutIcon, ThemePreference, TimeFormat } from '@/types/dashboard';

function slugId(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || randomUUID();
}

function parseRepositoryScopes(settings: DashboardSettings): string[] {
	try {
		const parsed = JSON.parse(settings.repositoryScopes);
		return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
	} catch {
		return [];
	}
}

function toSettings(settings: DashboardSettings, shortcuts: DashboardShortcut[]): DashboardConfig {
	const groups = new Map<string, ShortcutGroupConfig>();

	for (const shortcut of shortcuts.sort((a, b) => a.position - b.position)) {
		if (!groups.has(shortcut.groupId)) {
			groups.set(shortcut.groupId, { id: shortcut.groupId, label: shortcut.groupLabel, shortcuts: [] });
		}

		groups.get(shortcut.groupId)!.shortcuts.push({
			id: shortcut.id,
			label: shortcut.label,
			url: shortcut.url,
			icon: shortcut.icon,
		});
	}
	if (groups.size === 0) groups.set('shortcuts', { id: 'shortcuts', label: 'Shortcuts', shortcuts: [] });

	return {
		displayName: settings.displayName,
		timeZone: settings.timeZone,
		timeFormat: settings.timeFormat === '24' ? '24' : '12',
		theme: settings.theme === 'dark' || settings.theme === 'system' ? settings.theme : 'light',
		shortcutLimit: settings.shortcutLimit ?? 8,
		githubToken: settings.githubToken ?? null,
		github: { repositoryScopes: parseRepositoryScopes(settings), windowDays: settings.pullRequestWindowDays ?? 7 },
		shortcutGroups: Array.from(groups.values()),
	};
}

export function createDashboardRepository(db: EntityManager) {
	async function seedFromJsonIfEmpty(configPath: string = variables.DASHBOARD_CONFIG_PATH): Promise<boolean> {
		const existing = await db.findOne(DashboardSettings, { id: 'default' });
		if (existing) return false;

		const config = await loadDashboardConfig(configPath);
		const now = new Date();
		const settings = db.create(DashboardSettings, {
			id: 'default',
			displayName: config.displayName,
			timeZone: config.timeZone,
			timeFormat: config.timeFormat ?? '12',
			theme: config.theme ?? 'light',
			shortcutLimit: config.shortcutLimit ?? 8,
			pullRequestWindowDays: config.github.windowDays ?? 7,
			githubToken: config.githubToken ?? null,
			repositoryScopes: JSON.stringify(config.github.repositoryScopes),
			pullRequestFilters: '{}',
			createdAt: now,
			updatedAt: now,
		});
		const shortcuts: DashboardShortcut[] = [];

		for (const group of config.shortcutGroups) {
			for (const [index, shortcut] of group.shortcuts.entries()) {
				shortcuts.push(db.create(DashboardShortcut, {
					id: shortcut.id,
					groupId: group.id,
					groupLabel: group.label,
					label: shortcut.label,
					url: shortcut.url,
					icon: shortcut.icon,
					position: index,
					createdAt: now,
					updatedAt: now,
				}));
			}
		}
		await db.persist([settings, ...shortcuts]).flush();
		return true;
	}

	async function getSettings(): Promise<DashboardConfig> {
		const settings = await db.findOneOrFail(DashboardSettings, { id: 'default' });
		const shortcuts = await db.find(DashboardShortcut, {}, { orderBy: { groupId: 'asc', position: 'asc' } });
		return toSettings(settings, shortcuts);
	}

	async function updateSettings(input: { displayName?: string; timeZone?: string; timeFormat?: TimeFormat; theme?: ThemePreference; shortcutLimit?: number; pullRequestWindowDays?: number; githubToken?: string | null }): Promise<DashboardConfig> {
		const settings = await db.findOneOrFail(DashboardSettings, { id: 'default' });
		settings.displayName = typeof input.displayName === 'string' ? input.displayName.trim() : settings.displayName;
		settings.timeZone = typeof input.timeZone === 'string' ? input.timeZone : settings.timeZone;
		settings.timeFormat = input.timeFormat === '12' || input.timeFormat === '24' ? input.timeFormat : settings.timeFormat;
		settings.theme = input.theme === 'light' || input.theme === 'dark' || input.theme === 'system' ? input.theme : settings.theme;
		settings.shortcutLimit = typeof input.shortcutLimit === 'number' && Number.isInteger(input.shortcutLimit)
			? Math.max(1, Math.min(50, input.shortcutLimit))
			: settings.shortcutLimit;
		settings.pullRequestWindowDays = typeof input.pullRequestWindowDays === 'number' && Number.isInteger(input.pullRequestWindowDays)
			? Math.max(1, Math.min(30, input.pullRequestWindowDays))
			: settings.pullRequestWindowDays;
		settings.githubToken = input.githubToken !== undefined ? (input.githubToken ? input.githubToken.trim() : null) : settings.githubToken ?? null;
		await db.flush();
		return getSettings();
	}

	async function setRepositoryScopes(names: string[]): Promise<string[]> {
		const repositoryScopes = Array.from(new Set(names
			.map(name => name.trim())
			.filter(name => /^[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+|\*)$/.test(name))));
		const settings = await db.findOneOrFail(DashboardSettings, { id: 'default' });
		settings.repositoryScopes = JSON.stringify(repositoryScopes);
		await db.flush();
		return repositoryScopes;
	}

	async function importShortcuts(shortcutGroups: ShortcutGroupConfig[]): Promise<DashboardConfig> {
		return db.transactional(async transactionalDb => {
			const settings = await transactionalDb.findOneOrFail(DashboardSettings, { id: 'default' });
			const existing = await transactionalDb.find(DashboardShortcut, {}, { orderBy: { groupId: 'asc', position: 'asc' } });
			const imported = shortcutGroups.flatMap(group => group.shortcuts.map((shortcut, position) => ({
				id: shortcut.id,
				groupId: group.id,
				groupLabel: group.label,
				label: shortcut.label,
				url: shortcut.url,
				icon: shortcut.icon,
				position,
			}))).sort((a, b) => a.groupId.localeCompare(b.groupId) || a.position - b.position);
			const unchanged = existing.length === imported.length && existing.every((shortcut, index) => {
				const candidate = imported[index];
				return shortcut.id === candidate.id
					&& shortcut.groupId === candidate.groupId
					&& shortcut.groupLabel === candidate.groupLabel
					&& shortcut.label === candidate.label
					&& shortcut.url === candidate.url
					&& shortcut.icon === candidate.icon
					&& shortcut.position === candidate.position;
			});
			if (unchanged) return toSettings(settings, existing);

			await transactionalDb.nativeDelete(DashboardShortcut, {});
			const now = new Date();
			const shortcuts = imported.map(shortcut => transactionalDb.create(DashboardShortcut, {
				id: shortcut.id,
				groupId: shortcut.groupId,
				groupLabel: shortcut.groupLabel,
				label: shortcut.label,
				url: shortcut.url,
				icon: shortcut.icon,
				position: shortcut.position,
				createdAt: now,
				updatedAt: now,
			}));

			if (shortcuts.length > 0) transactionalDb.persist(shortcuts);
			await transactionalDb.flush();
			return toSettings(settings, shortcuts);
		});
	}

	async function updateShortcut(id: string, input: { label?: string; url?: string }): Promise<ShortcutConfig> {
		const shortcut = await db.findOne(DashboardShortcut, { id });
		if (!shortcut) throw new ShortcutValidationError('Shortcut not found', { shortcutId: 'Shortcut not found' });
		const validated = validateShortcutInput({
			groupId: shortcut.groupId,
			label: input.label ?? shortcut.label,
			url: input.url ?? shortcut.url,
			icon: shortcut.icon,
		});
		shortcut.label = validated.label;
		shortcut.url = validated.url;
		shortcut.updatedAt = new Date();
		await db.flush();
		return { id: shortcut.id, label: shortcut.label, url: shortcut.url, icon: shortcut.icon };
	}

	async function deleteShortcut(id: string): Promise<void> {
		const shortcut = await db.findOne(DashboardShortcut, { id });
		if (!shortcut) throw new ShortcutValidationError('Shortcut not found', { shortcutId: 'Shortcut not found' });
		const groupId = shortcut.groupId;
		db.remove(shortcut);
		const remaining = await db.find(DashboardShortcut, { groupId }, { orderBy: { position: 'asc' } });
		remaining.filter(item => item.id !== id).forEach((item, position) => {
			item.position = position;
			item.updatedAt = new Date();
		});
		await db.flush();
	}

	async function addShortcut(input: AddShortcutInput): Promise<ShortcutConfig> {
		const validated = validateShortcutInput(input);
		const existing = await db.find(DashboardShortcut, { groupId: validated.groupId }, { orderBy: { position: 'asc' } });
		const id = `${slugId(validated.label)}-${randomUUID().slice(0, 6)}`;
		const groupLabel = existing[0]?.groupLabel ?? 'Shortcuts';
		const position = validated.position ?? existing.length;
		const now = new Date();
		const shortcut = db.create(DashboardShortcut, { id, groupId: validated.groupId, groupLabel, label: validated.label, url: validated.url, icon: validated.icon, position, createdAt: now, updatedAt: now });
		await db.persist(shortcut).flush();
		return { id, label: validated.label, url: validated.url, icon: validated.icon as ShortcutIcon };
	}

	async function addShortcuts(inputs: AddShortcutInput[]): Promise<number> {
		const validated = inputs.map(validateShortcutInput);
		return db.transactional(async transactionalDb => {
			const existing = await transactionalDb.find(DashboardShortcut, {}, { orderBy: { groupId: 'asc', position: 'asc' } });
			const knownUrls = new Set(existing.map(shortcut => shortcut.url));
			const groupLabels = new Map(existing.map(shortcut => [shortcut.groupId, shortcut.groupLabel]));
			const nextPositions = new Map<string, number>();
			for (const shortcut of existing) {
				nextPositions.set(shortcut.groupId, Math.max(nextPositions.get(shortcut.groupId) ?? 0, shortcut.position + 1));
			}
			const now = new Date();
			const additions: DashboardShortcut[] = [];
			for (const shortcut of validated) {
				if (knownUrls.has(shortcut.url)) continue;
				knownUrls.add(shortcut.url);
				const position = nextPositions.get(shortcut.groupId) ?? 0;
				nextPositions.set(shortcut.groupId, position + 1);
				additions.push(transactionalDb.create(DashboardShortcut, {
					id: `${slugId(shortcut.label)}-${randomUUID().slice(0, 6)}`,
					groupId: shortcut.groupId,
					groupLabel: groupLabels.get(shortcut.groupId) ?? 'Shortcuts',
					label: shortcut.label,
					url: shortcut.url,
					icon: shortcut.icon,
					position,
					createdAt: now,
					updatedAt: now,
				}));
			}
			if (additions.length > 0) {
				transactionalDb.persist(additions);
				await transactionalDb.flush();
			}
			return additions.length;
		});
	}

	async function reorderShortcuts(groupId: string, shortcutIds: string[]): Promise<ShortcutConfig[]> {
		const shortcuts = await db.find(DashboardShortcut, { groupId }, { orderBy: { position: 'asc' } });
		const currentIds = new Set(shortcuts.map(shortcut => shortcut.id));
		const requestedIds = new Set(shortcutIds);

		if (
			!groupId.trim()
			|| shortcuts.length === 0
			|| shortcuts.length !== shortcutIds.length
			|| requestedIds.size !== shortcutIds.length
			|| shortcutIds.some(id => !currentIds.has(id))
		) {
			throw new ShortcutValidationError('Invalid shortcut order', {
				shortcutIds: 'Order must contain every shortcut in the group exactly once',
			});
		}

		const shortcutsById = new Map(shortcuts.map(shortcut => [shortcut.id, shortcut]));
		shortcutIds.forEach((id, position) => {
			const shortcut = shortcutsById.get(id)!;
			shortcut.position = position;
			shortcut.updatedAt = new Date();
		});

		await db.flush();
		return shortcutIds.map(id => {
			const shortcut = shortcutsById.get(id)!;
			return { id: shortcut.id, label: shortcut.label, url: shortcut.url, icon: shortcut.icon };
		});
	}

	return {
		seedFromJsonIfEmpty,
		getSettings,
		updateSettings,
		setRepositoryScopes,
		importShortcuts,
		updateShortcut,
		deleteShortcut,
		addShortcut,
		addShortcuts,
		reorderShortcuts,
	};
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
