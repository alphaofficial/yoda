import { promises as fs } from 'fs';
import type {
	AddShortcutInput,
	DashboardConfig,
	ShortcutSettingsExport,
	ShortcutConfig,
	ShortcutGroupConfig,
} from '@/types/dashboard';
import { DashboardConfigError, ShortcutValidationError } from '@/types/dashboard';
import variables from '@/config/variables';

const DASHBOARD_CONFIG_PATH = variables.DASHBOARD_CONFIG_PATH;

const ID_REGEX = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LABEL_MAX_LENGTH = 60;
const DISPLAY_NAME_MAX_LENGTH = 60;
const VALID_PROTOCOLS = ['http:', 'https:', 'obsidian:'];

function generateId(label: string, existingIds: Set<string>): string {
	const base = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 34);

	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let suffix = '';
	for (let i = 0; i < 6; i++) {
		suffix += chars[Math.floor(Math.random() * chars.length)];
	}

	let id = `${base}-${suffix}`;
	let attempts = 0;
	while (existingIds.has(id) && attempts < 10) {
		suffix = '';
		for (let i = 0; i < 6; i++) {
			suffix += chars[Math.floor(Math.random() * chars.length)];
		}
		id = `${base}-${suffix}`;
		attempts++;
	}

	return id;
}

function validateTimeZone(timeZone: string): void {
	try {
		Intl.DateTimeFormat(undefined, { timeZone });
	} catch {
		throw new DashboardConfigError('Invalid time zone', { timeZone });
	}
}

function validateRepository(repo: string): void {
	if (!/^[^/]+\/[^/]+$/.test(repo)) {
		throw new DashboardConfigError('Invalid repository format', { repository: repo });
	}
}

function validateId(id: string, fieldName: string): void {
	if (!ID_REGEX.test(id)) {
		throw new DashboardConfigError(
			`Invalid ${fieldName} ID`,
			{ [fieldName]: id }
		);
	}
}

function validateLabel(label: string, fieldName = 'Label'): void {
	const trimmed = label.trim();
	if (trimmed.length === 0) {
		throw new DashboardConfigError(`${fieldName} is required`, { label });
	}
	if (trimmed.length > LABEL_MAX_LENGTH) {
		throw new DashboardConfigError(
			`${fieldName} must be 1-${LABEL_MAX_LENGTH} characters`,
			{ label }
		);
	}
}

function validateShortcutUrl(urlString: string): void {
	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		throw new ShortcutValidationError('Invalid URL', { url: urlString });
	}

	if (!VALID_PROTOCOLS.includes(url.protocol)) {
		throw new ShortcutValidationError('Invalid URL protocol', { url: urlString });
	}

	if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.host) {
		throw new ShortcutValidationError('URL must have a host', { url: urlString });
	}

	if (url.username || url.password) {
		throw new ShortcutValidationError('URL must not contain credentials', { url: urlString });
	}
}

function validateUrl(urlString: string): void {
	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		throw new DashboardConfigError('Invalid URL', { url: urlString });
	}

	if (!VALID_PROTOCOLS.includes(url.protocol)) {
		throw new DashboardConfigError('Invalid URL protocol', { url: urlString });
	}

	if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.host) {
		throw new DashboardConfigError('URL must have a host', { url: urlString });
	}

	if (url.username || url.password) {
		throw new DashboardConfigError('URL must not contain credentials', { url: urlString });
	}
}

function validateDisplayName(displayName: string): void {
	const trimmed = displayName.trim();
	if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
		throw new DashboardConfigError(
			`Display name must be 1–${DISPLAY_NAME_MAX_LENGTH} characters`,
			{ displayName }
		);
	}
}

export function validateDashboardConfig(config: unknown): DashboardConfig {
	if (!config || typeof config !== 'object') {
		throw new DashboardConfigError('Configuration must be an object');
	}

	const c = config as Record<string, unknown>;

	if (typeof c.displayName !== 'string') {
		throw new DashboardConfigError('displayName is required');
	}
	validateDisplayName(c.displayName);

	if (typeof c.timeZone !== 'string') {
		throw new DashboardConfigError('timeZone is required');
	}
	validateTimeZone(c.timeZone);
	if (c.timeFormat !== undefined && c.timeFormat !== '12' && c.timeFormat !== '24') {
		throw new DashboardConfigError('timeFormat must be 12 or 24');
	}
	if (c.theme !== undefined && c.theme !== 'light' && c.theme !== 'dark' && c.theme !== 'system') {
		throw new DashboardConfigError('theme must be light, dark, or system');
	}

	const github = c.github;
	if (!github || typeof github !== 'object') {
		throw new DashboardConfigError('github configuration is required');
	}
	const gh = github as Record<string, unknown>;
	const repositoryScopes = gh.repositoryScopes;
	if (!Array.isArray(repositoryScopes)) {
		throw new DashboardConfigError('github.repositoryScopes must be an array');
	}
	const seenRepos = new Set<string>();
	for (const repo of repositoryScopes) {
		if (typeof repo !== 'string') {
			throw new DashboardConfigError('Repository must be a string');
		}
		if (seenRepos.has(repo)) {
			throw new DashboardConfigError('Duplicate repository', { repository: repo });
		}
		seenRepos.add(repo);
		validateRepository(repo);
	}

	const shortcutGroups = c.shortcutGroups;
	if (!Array.isArray(shortcutGroups)) {
		throw new DashboardConfigError('shortcutGroups must be an array');
	}

	const seenGroupIds = new Set<string>();
	const seenShortcutIds = new Set<string>();
	for (const group of shortcutGroups) {
		if (!group || typeof group !== 'object') {
			throw new DashboardConfigError('Each shortcut group must be an object');
		}
		const g = group as Record<string, unknown>;

		if (typeof g.id !== 'string') {
			throw new DashboardConfigError('Group ID is required');
		}
		validateId(g.id, 'group');
		if (seenGroupIds.has(g.id)) {
			throw new DashboardConfigError('Duplicate group ID', { groupId: g.id });
		}
		seenGroupIds.add(g.id);

		if (typeof g.label !== 'string') {
			throw new DashboardConfigError('Group label is required');
		}
		validateLabel(g.label, 'Group label');

		const shortcuts = g.shortcuts;
		if (!Array.isArray(shortcuts)) {
			throw new DashboardConfigError('Group shortcuts must be an array');
		}

		for (const shortcut of shortcuts) {
			if (!shortcut || typeof shortcut !== 'object') {
				throw new DashboardConfigError('Each shortcut must be an object');
			}
			const s = shortcut as Record<string, unknown>;

			if (typeof s.id !== 'string') {
				throw new DashboardConfigError('Shortcut ID is required');
			}
			validateId(s.id, 'shortcut');
			if (seenShortcutIds.has(s.id)) {
				throw new DashboardConfigError('Duplicate shortcut ID', { shortcutId: s.id });
			}
			seenShortcutIds.add(s.id);

			if (typeof s.label !== 'string') {
				throw new DashboardConfigError('Shortcut label is required');
			}
			validateLabel(s.label, 'Shortcut label');

			if (typeof s.url !== 'string') {
				throw new DashboardConfigError('Shortcut URL is required');
			}
			validateUrl(s.url);
		}
	}

	return {
		displayName: c.displayName.trim(),
		timeZone: c.timeZone,
		timeFormat: c.timeFormat === '24' ? '24' : '12',
		theme: c.theme === 'dark' || c.theme === 'system' ? c.theme : 'light',
		shortcutLimit: typeof c.shortcutLimit === 'number' && Number.isInteger(c.shortcutLimit) && c.shortcutLimit >= 1 && c.shortcutLimit <= 50 ? c.shortcutLimit : 8,
		githubToken: typeof c.githubToken === 'string' ? c.githubToken : null,
		github: {
			repositoryScopes: repositoryScopes as string[],
			windowDays: typeof gh.windowDays === 'number' && Number.isInteger(gh.windowDays) && gh.windowDays >= 1 && gh.windowDays <= 30 ? gh.windowDays : 7,
		},
		shortcutGroups: (shortcutGroups as Array<{ id: string; label: string; shortcuts: Array<{ id: string; label: string; url: string }> }>).map(group => ({
			id: group.id,
			label: group.label,
			shortcuts: group.shortcuts.map(shortcut => ({
				id: shortcut.id,
				label: shortcut.label,
				url: shortcut.url,
			})),
		})),
	};
}

export function createShortcutSettingsExport(
	shortcutGroups: ShortcutGroupConfig[],
	exportedAt: Date = new Date(),
): ShortcutSettingsExport {
	return {
		version: 1,
		exportedAt: exportedAt.toISOString(),
		shortcutGroups,
	};
}

export function validateShortcutSettingsImport(input: unknown): ShortcutGroupConfig[] {
	if (!input || typeof input !== 'object') {
		throw new DashboardConfigError('Shortcut import must be an object');
	}

	const envelope = input as Record<string, unknown>;
	if (envelope.version !== 1) {
		throw new DashboardConfigError('Unsupported shortcut export version');
	}

	const config = validateDashboardConfig({
		displayName: 'Imported shortcuts',
		timeZone: 'UTC',
		github: { repositoryScopes: [] },
		shortcutGroups: envelope.shortcutGroups,
	});
	return config.shortcutGroups;
}

export async function loadDashboardConfig(
	configPath: string = DASHBOARD_CONFIG_PATH
): Promise<DashboardConfig> {
	try {
		const content = await fs.readFile(configPath, 'utf-8');
		const parsed = JSON.parse(content);
		return validateDashboardConfig(parsed);
	} catch (e) {
		if (e instanceof DashboardConfigError) throw e;
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DashboardConfigError('Configuration file not found');
		}
		throw new DashboardConfigError(`Failed to read configuration: ${(e as Error).message}`);
	}
}

export async function saveDashboardConfig(
	config: DashboardConfig,
	configPath: string
): Promise<void> {
	const content = JSON.stringify(config, null, '\t') + '\n';
	const tmpPath = configPath + '.tmp';
	await fs.writeFile(tmpPath, content, 'utf-8');
	await fs.rename(tmpPath, configPath);
}

export function validateShortcutInput(input: unknown): AddShortcutInput {
	if (!input || typeof input !== 'object') {
		throw new ShortcutValidationError('Invalid input');
	}

	const i = input as Record<string, unknown>;

	if (typeof i.groupId !== 'string') {
		throw new ShortcutValidationError('groupId is required', { groupId: 'Required' });
	}
	validateId(i.groupId, 'group');

	if (typeof i.label !== 'string') {
		throw new ShortcutValidationError('label is required', { label: 'Required' });
	}
	validateLabel(i.label, 'Shortcut label');

	if (typeof i.url !== 'string') {
		throw new ShortcutValidationError('url is required', { url: 'Required' });
	}
	validateShortcutUrl(i.url);

	if (i.position !== undefined && (typeof i.position !== 'number' || !Number.isInteger(i.position))) {
		throw new ShortcutValidationError('position must be an integer', { position: 'Must be an integer' });
	}

	return {
		groupId: i.groupId,
		label: i.label.trim(),
		url: i.url,
		position: i.position as number | undefined,
	};
}

export async function addShortcut(
	input: AddShortcutInput,
	configPath: string = DASHBOARD_CONFIG_PATH
): Promise<ShortcutConfig> {
	const validated = validateShortcutInput(input);

	const config = await loadDashboardConfig(configPath);

	const group = config.shortcutGroups.find(g => g.id === validated.groupId);
	if (!group) {
		throw new ShortcutValidationError('Group not found', { groupId: 'Group not found' });
	}

	const existingIds = new Set(group.shortcuts.map(s => s.id));
	const id = generateId(validated.label, existingIds);

	const position = validated.position ?? group.shortcuts.length;
	const clampedPosition = Math.max(0, Math.min(position, group.shortcuts.length));

	const shortcut: ShortcutConfig = {
		id,
		label: validated.label,
		url: validated.url,
	};

	group.shortcuts.splice(clampedPosition, 0, shortcut);

	await saveDashboardConfig(config, configPath);

	return shortcut;
}
