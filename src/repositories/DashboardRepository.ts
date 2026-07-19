import { randomUUID } from 'crypto';
import { EntityManager } from '@mikro-orm/core';
import { loadDashboardConfig, validateShortcutInput } from '@/config/dashboard';
import variables from '@/config/variables';
import { DashboardSettings } from '@/models/DashboardSettings';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import { ShortcutValidationError } from '@/types/dashboard';
import type { AddShortcutInput, DashboardConfig, ShortcutConfig, ShortcutGroupConfig, ThemePreference, TimeFormat } from '@/types/dashboard';

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
			groups.set(shortcut.groupId, { id: shortcut.groupId, label: shortcut.groupId === 'shortcuts' && shortcut.groupLabel === 'Shortcuts' ? 'Quick links' : shortcut.groupLabel, shortcuts: [] });
		}

		groups.get(shortcut.groupId)!.shortcuts.push({
			id: shortcut.id,
			label: shortcut.label,
			url: shortcut.url,
		});
	}
	if (groups.size === 0) groups.set('shortcuts', { id: 'shortcuts', label: 'Quick links', shortcuts: [] });

	return {
		displayName: settings.displayName,
		timeZone: settings.timeZone,
		timeFormat: settings.timeFormat === '24' ? '24' : '12',
		theme: settings.theme === 'dark' || settings.theme === 'system' ? settings.theme : 'light',
		shortcutLimit: settings.shortcutLimit ?? 8,
		backupIntervalHours: settings.backupIntervalHours ?? 24,
		backupRetentionDays: settings.backupRetentionDays ?? 30,
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
			backupIntervalHours: 24,
			backupRetentionDays: 30,
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

	async function getBackupPolicy(): Promise<{ intervalHours: number; retentionDays: number } | null> {
		const settings = await db.findOne(DashboardSettings, { id: 'default' });
		if (!settings) return null;
		return {
			intervalHours: settings.backupIntervalHours ?? 24,
			retentionDays: settings.backupRetentionDays ?? 30,
		};
	}

	async function updateSettings(input: { displayName?: string; timeZone?: string; timeFormat?: TimeFormat; theme?: ThemePreference; shortcutLimit?: number; pullRequestWindowDays?: number; backupIntervalHours?: number; backupRetentionDays?: number; githubToken?: string | null }): Promise<DashboardConfig> {
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
		settings.backupIntervalHours = typeof input.backupIntervalHours === 'number'
			&& [0, 1, 6, 12, 24, 168].includes(input.backupIntervalHours)
			? input.backupIntervalHours
			: settings.backupIntervalHours;
		settings.backupRetentionDays = typeof input.backupRetentionDays === 'number' && Number.isInteger(input.backupRetentionDays)
			? Math.max(1, Math.min(365, input.backupRetentionDays))
			: settings.backupRetentionDays;
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
			const now = new Date();
			let changed = false;
			const importedNames = new Set<string>();
			const importedGroupLabels = new Map<string, string>();
			const imported = shortcutGroups.flatMap(group => {
				importedGroupLabels.set(group.id, group.label);
				return group.shortcuts.flatMap(shortcut => {
					const name = shortcut.label.trim().toLowerCase();
					if (importedNames.has(name)) return [];
					importedNames.add(name);
					return [{ groupId: group.id, groupLabel: group.label, shortcut, name }];
				});
			});
			const importedIds = new Set(imported.map(candidate => candidate.shortcut.id));
			const preferredIdByName = new Map(imported.map(candidate => [candidate.name, candidate.shortcut.id]));
			const removed = new Set<DashboardShortcut>();
			const existingById = new Map<string, DashboardShortcut>();
			const existingByName = new Map<string, DashboardShortcut>();

			// Keep one shortcut for each name, preferring the ID supplied by the import.
			for (const shortcut of existing) {
				const name = shortcut.label.trim().toLowerCase();
				const duplicate = existingByName.get(name);
				if (duplicate && preferredIdByName.get(name) === shortcut.id) {
					removed.add(duplicate);
					transactionalDb.remove(duplicate);
					existingById.delete(duplicate.id);
					existingById.set(shortcut.id, shortcut);
					existingByName.set(name, shortcut);
					changed = true;
					continue;
				}
				if (duplicate) {
					removed.add(shortcut);
					transactionalDb.remove(shortcut);
					changed = true;
					continue;
				}
				existingById.set(shortcut.id, shortcut);
				existingByName.set(name, shortcut);
			}

			const nextPositions = new Map<string, number>();
			for (const shortcut of existingById.values()) {
				nextPositions.set(shortcut.groupId, Math.max(nextPositions.get(shortcut.groupId) ?? 0, shortcut.position + 1));
			}

			const claimed = new Set<DashboardShortcut>();
			const created: DashboardShortcut[] = [];

			for (const { groupId, groupLabel, shortcut, name } of imported) {
				const idMatch = existingById.get(shortcut.id);
				const nameMatch = existingByName.get(name);
				if (idMatch && nameMatch && idMatch !== nameMatch && claimed.has(nameMatch)) continue;
				if (idMatch && nameMatch && idMatch !== nameMatch && !importedIds.has(nameMatch.id)) {
					removed.add(nameMatch);
					transactionalDb.remove(nameMatch);
					existingById.delete(nameMatch.id);
					changed = true;
				}

				const target = idMatch ?? nameMatch;
				if (target && (removed.has(target) || claimed.has(target))) continue;
				if (target) {
					claimed.add(target);
					const groupChanged = target.groupId !== groupId;
					const position = groupChanged ? nextPositions.get(groupId) ?? 0 : target.position;
					if (groupChanged) nextPositions.set(groupId, position + 1);
					const targetChanged = target.groupId !== groupId
						|| target.groupLabel !== groupLabel
						|| target.label !== shortcut.label
						|| target.url !== shortcut.url
						|| target.position !== position;
					if (targetChanged) {
						existingByName.delete(target.label.trim().toLowerCase());
						target.groupId = groupId;
						target.groupLabel = groupLabel;
						target.label = shortcut.label;
						target.url = shortcut.url;
						target.position = position;
						target.updatedAt = now;
						existingByName.set(name, target);
						changed = true;
					}
					continue;
				}

				const position = nextPositions.get(groupId) ?? 0;
				nextPositions.set(groupId, position + 1);
				const addition = transactionalDb.create(DashboardShortcut, {
					id: shortcut.id,
					groupId,
					groupLabel,
					label: shortcut.label,
					url: shortcut.url,
					position,
					createdAt: now,
					updatedAt: now,
				});
				created.push(addition);
				claimed.add(addition);
				changed = true;
			}

			const shortcuts = [...existing.filter(shortcut => !removed.has(shortcut)), ...created];
			for (const shortcut of shortcuts) {
				const groupLabel = importedGroupLabels.get(shortcut.groupId);
				if (groupLabel && shortcut.groupLabel !== groupLabel) {
					shortcut.groupLabel = groupLabel;
					shortcut.updatedAt = now;
					changed = true;
				}
			}

			const grouped = new Map<string, DashboardShortcut[]>();
			for (const shortcut of shortcuts) {
				const group = grouped.get(shortcut.groupId) ?? [];
				group.push(shortcut);
				grouped.set(shortcut.groupId, group);
			}
			for (const group of grouped.values()) {
				group.sort((a, b) => a.position - b.position);
				group.forEach((shortcut, position) => {
					if (shortcut.position === position) return;
					shortcut.position = position;
					shortcut.updatedAt = now;
					changed = true;
				});
			}

			if (created.length > 0) transactionalDb.persist(created);
			if (changed) await transactionalDb.flush();
			return toSettings(settings, shortcuts);
		});
	}

	async function updateShortcut(id: string, input: { label?: string; url?: string }): Promise<ShortcutConfig> {
		const shortcut = await db.findOne(DashboardShortcut, { id });
		if (!shortcut) throw new ShortcutValidationError('Quick link not found', { shortcutId: 'Quick link not found' });
		const validated = validateShortcutInput({
			groupId: shortcut.groupId,
			label: input.label ?? shortcut.label,
			url: input.url ?? shortcut.url,
		});
		shortcut.label = validated.label;
		shortcut.url = validated.url;
		shortcut.updatedAt = new Date();
		await db.flush();
		return { id: shortcut.id, label: shortcut.label, url: shortcut.url };
	}

	async function deleteShortcut(id: string): Promise<void> {
		const shortcut = await db.findOne(DashboardShortcut, { id });
		if (!shortcut) throw new ShortcutValidationError('Quick link not found', { shortcutId: 'Quick link not found' });
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
		const groupLabel = existing[0]?.groupLabel ?? 'Quick links';
		const position = validated.position ?? existing.length;
		const now = new Date();
		const shortcut = db.create(DashboardShortcut, { id, groupId: validated.groupId, groupLabel, label: validated.label, url: validated.url, position, createdAt: now, updatedAt: now });
		await db.persist(shortcut).flush();
		return { id, label: validated.label, url: validated.url };
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
					groupLabel: groupLabels.get(shortcut.groupId) ?? 'Quick links',
					label: shortcut.label,
					url: shortcut.url,
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
			throw new ShortcutValidationError('Invalid quick link order', {
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
			return { id: shortcut.id, label: shortcut.label, url: shortcut.url };
		});
	}

	return {
		seedFromJsonIfEmpty,
		getSettings,
		getBackupPolicy,
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
