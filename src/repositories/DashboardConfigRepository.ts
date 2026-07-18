import { randomUUID } from 'crypto';
import { EntityManager } from '@mikro-orm/core';
import { loadDashboardConfig, validateShortcutInput } from '@/config/dashboard';
import variables from '@/config/variables';
import { DashboardSettings } from '@/models/DashboardSettings';
import { DashboardShortcut } from '@/models/DashboardShortcut';
import { ShortcutValidationError } from '@/types/dashboard';
import type { AddShortcutInput, DashboardConfig, ShortcutConfig, ShortcutGroupConfig, ShortcutIcon } from '@/types/dashboard';

function slugId(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || randomUUID();
}

function parseRepositories(settings: DashboardSettings): string[] {
	try {
		const parsed = JSON.parse(settings.repositories);
		return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
	} catch {
		return [];
	}
}

function toConfig(settings: DashboardSettings, shortcuts: DashboardShortcut[]): DashboardConfig {
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
		shortcutLimit: settings.shortcutLimit ?? 8,
		githubToken: settings.githubToken ?? null,
		github: { repositories: parseRepositories(settings), windowDays: settings.pullRequestWindowDays ?? 7 },
		shortcutGroups: Array.from(groups.values()),
	};
}

export class DashboardConfigRepository {
	constructor(private readonly db: EntityManager) {}

	async seedFromJsonIfEmpty(configPath: string = variables.DASHBOARD_CONFIG_PATH): Promise<boolean> {
		const existing = await this.db.findOne(DashboardSettings, { id: 'default' });
		if (existing) return false;

		const config = await loadDashboardConfig(configPath);
		const now = new Date();
		const settings = this.db.create(DashboardSettings, {
			id: 'default',
			displayName: config.displayName,
			timeZone: config.timeZone,
			shortcutLimit: config.shortcutLimit ?? 8,
			pullRequestWindowDays: config.github.windowDays ?? 7,
			githubToken: config.githubToken ?? null,
			repositories: JSON.stringify(config.github.repositories),
			pullRequestFilters: '{}',
			createdAt: now,
			updatedAt: now,
		});
		const shortcuts: DashboardShortcut[] = [];

		for (const group of config.shortcutGroups) {
			for (const [index, shortcut] of group.shortcuts.entries()) {
				shortcuts.push(this.db.create(DashboardShortcut, {
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
		await this.db.persist([settings, ...shortcuts]).flush();
		return true;
	}

	async getConfig(): Promise<DashboardConfig> {
		const settings = await this.db.findOneOrFail(DashboardSettings, { id: 'default' });
		const shortcuts = await this.db.find(DashboardShortcut, {}, { orderBy: { groupId: 'asc', position: 'asc' } });
		return toConfig(settings, shortcuts);
	}

	async updateSettings(input: { displayName?: string; timeZone?: string; shortcutLimit?: number; pullRequestWindowDays?: number; githubToken?: string | null }): Promise<DashboardConfig> {
		const settings = await this.db.findOneOrFail(DashboardSettings, { id: 'default' });
		settings.displayName = typeof input.displayName === 'string' ? input.displayName.trim() : settings.displayName;
		settings.timeZone = typeof input.timeZone === 'string' ? input.timeZone : settings.timeZone;
		settings.shortcutLimit = typeof input.shortcutLimit === 'number' && Number.isInteger(input.shortcutLimit)
			? Math.max(1, Math.min(50, input.shortcutLimit))
			: settings.shortcutLimit;
		settings.pullRequestWindowDays = typeof input.pullRequestWindowDays === 'number' && Number.isInteger(input.pullRequestWindowDays)
			? Math.max(1, Math.min(30, input.pullRequestWindowDays))
			: settings.pullRequestWindowDays;
		settings.githubToken = input.githubToken !== undefined ? (input.githubToken ? input.githubToken.trim() : null) : settings.githubToken ?? null;
		await this.db.flush();
		return this.getConfig();
	}

	async setRepositories(names: string[]): Promise<string[]> {
		const repositories = Array.from(new Set(names
			.map(name => name.trim())
			.filter(name => /^[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+|\*)$/.test(name))));
		const settings = await this.db.findOneOrFail(DashboardSettings, { id: 'default' });
		settings.repositories = JSON.stringify(repositories);
		await this.db.flush();
		return repositories;
	}

	async updateShortcut(id: string, input: { label?: string; url?: string }): Promise<ShortcutConfig> {
		const shortcut = await this.db.findOne(DashboardShortcut, { id });
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
		await this.db.flush();
		return { id: shortcut.id, label: shortcut.label, url: shortcut.url, icon: shortcut.icon };
	}

	async deleteShortcut(id: string): Promise<void> {
		const shortcut = await this.db.findOne(DashboardShortcut, { id });
		if (!shortcut) throw new ShortcutValidationError('Shortcut not found', { shortcutId: 'Shortcut not found' });
		const groupId = shortcut.groupId;
		this.db.remove(shortcut);
		const remaining = await this.db.find(DashboardShortcut, { groupId }, { orderBy: { position: 'asc' } });
		remaining.filter(item => item.id !== id).forEach((item, position) => {
			item.position = position;
			item.updatedAt = new Date();
		});
		await this.db.flush();
	}

	async addShortcut(input: AddShortcutInput): Promise<ShortcutConfig> {
		const validated = validateShortcutInput(input);
		const existing = await this.db.find(DashboardShortcut, { groupId: validated.groupId }, { orderBy: { position: 'asc' } });
		const id = `${slugId(validated.label)}-${randomUUID().slice(0, 6)}`;
		const groupLabel = existing[0]?.groupLabel ?? 'Shortcuts';
		const position = validated.position ?? existing.length;
		const now = new Date();
		const shortcut = this.db.create(DashboardShortcut, { id, groupId: validated.groupId, groupLabel, label: validated.label, url: validated.url, icon: validated.icon, position, createdAt: now, updatedAt: now });
		await this.db.persist(shortcut).flush();
		return { id, label: validated.label, url: validated.url, icon: validated.icon as ShortcutIcon };
	}

	async reorderShortcuts(groupId: string, shortcutIds: string[]): Promise<ShortcutConfig[]> {
		const shortcuts = await this.db.find(DashboardShortcut, { groupId }, { orderBy: { position: 'asc' } });
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

		await this.db.flush();
		return shortcutIds.map(id => {
			const shortcut = shortcutsById.get(id)!;
			return { id: shortcut.id, label: shortcut.label, url: shortcut.url, icon: shortcut.icon };
		});
	}
}
