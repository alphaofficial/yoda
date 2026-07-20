import { type Request, type Response } from 'express';
import { dashboard } from '@/core/dashboard';
import { createDatabaseBackup, getBackupStatus } from '@/core/backup';
import { messages } from '@/config/messages';
import { createShortcutSettingsExport, validateShortcutSettingsImport } from '@/config/dashboard';
import { DashboardConfigError } from '@/types/dashboard';
import type { DashboardConfig } from '@/types/dashboard';

export type SettingsSection = 'general' | 'github' | 'shortcuts' | 'backups';

function settingsResponse(settings: DashboardConfig) {
	return {
		displayName: settings.displayName,
		timeZone: settings.timeZone,
		timeFormat: settings.timeFormat ?? '12',
		theme: settings.theme ?? 'light',
		shortcutLimit: settings.shortcutLimit ?? 8,
		backupIntervalHours: settings.backupIntervalHours ?? 24,
		backupRetentionDays: settings.backupRetentionDays ?? 30,
		pullRequestWindowDays: settings.github.windowDays ?? 7,
		githubTokenConfigured: !!settings.githubToken,
		repositoryScopes: settings.github.repositoryScopes,
		shortcutGroups: settings.shortcutGroups,
	};
}

export async function settingsIndex(req: Request, res: Response) {
	const settings = await dashboard.settings(req.ctx.db);
	const requestedSection = typeof req.query.section === 'string' ? req.query.section : '';
	const activeSection: SettingsSection = requestedSection === 'github' || requestedSection === 'shortcuts' || requestedSection === 'backups' ? requestedSection : 'general';
	let catalog;
	let repositoryError = '';
	if (activeSection === 'github' && settings.githubToken) {
		try {
			catalog = await dashboard.githubRepositories(req.ctx.db, req.query.refresh === '1');
		} catch (error) {
			repositoryError = error instanceof Error ? error.message : messages.github.loadRepositoriesFailed;
		}
	}
	return res.render('Settings', {
		theme: settings.theme ?? 'light',
		activeSection,
		repositoryCatalog: catalog ? {
			...catalog,
			selectedScopes: settings.github.repositoryScopes.length > 0 ? settings.github.repositoryScopes : catalog.defaultScopes,
		} : null,
		repositoryError,
		backupStatus: await getBackupStatus(),
		settings: settingsResponse(settings),
	});
}

export async function updateSettings(req: Request, res: Response) {
	const requestedSection = typeof req.query.section === 'string' ? req.query.section : '';
	const section: SettingsSection = requestedSection === 'github' || requestedSection === 'shortcuts' || requestedSection === 'backups' ? requestedSection : 'general';
	try {
		await dashboard.updateSettings(req.ctx.db, req.body);
		const message = section === 'github'
			? messages.github.settingsSaved
			: section === 'shortcuts' ? messages.shortcuts.limitSaved
				: section === 'backups' ? messages.backup.settingsSaved : messages.settings.generalSaved;
		req.session.flash = { message };
		return res.redirect(303, `/settings?section=${section}`);
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			req.session.flash = { message: error.message };
			return res.redirect(303, `/settings?section=${section}`);
		}
		throw error;
	}
}

export async function createBackup(req: Request, res: Response) {
	try {
		const settings = await dashboard.settings(req.ctx.db);
		await createDatabaseBackup(
			req.ctx.db,
			settings.backupRetentionDays ?? 30,
			new Date(),
			undefined,
			(settings.backupIntervalHours ?? 24) !== 0,
		);
		req.session.flash = { message: messages.backup.created };
		return res.redirect(303, '/settings?section=backups');
	} catch (error) {
		const message = error instanceof Error ? error.message : messages.backup.createFailed;
		req.session.flash = { message };
		return res.redirect(303, '/settings?section=backups');
	}
}

export async function exportShortcuts(req: Request, res: Response) {
	const settings = await dashboard.settings(req.ctx.db);
	const exported = createShortcutSettingsExport(settings.shortcutGroups);
	const date = exported.exportedAt.slice(0, 10);
	res.attachment(`yoda-quick-links-${date}.json`);
	return res.json(exported);
}

export async function importShortcuts(req: Request, res: Response) {
	try {
		const imported = validateShortcutSettingsImport(req.body);
		await dashboard.importShortcuts(req.ctx.db, imported);
		req.session.flash = { message: messages.shortcuts.imported };
		return res.redirect(303, '/settings?section=shortcuts');
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			req.session.flash = { message: error.message };
			return res.redirect(303, '/settings?section=shortcuts');
		}
		throw error;
	}
}
