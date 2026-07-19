import { type Request, type Response } from 'express';
import { dashboard } from '@/core/dashboard';
import { createDatabaseBackup, getBackupStatus } from '@/core/backup';
import { createShortcutSettingsExport, validateShortcutSettingsImport } from '@/config/dashboard';
import { DashboardConfigError } from '@/types/dashboard';
import type { DashboardConfig } from '@/types/dashboard';
import { consumeSettingsFeedback, redirectToSettings, type SettingsSection } from '@/controllers/settingsRedirect';

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
			repositoryError = error instanceof Error ? error.message : 'Could not load repositories from GitHub.';
		}
	}
	return res.render('Settings', {
		theme: settings.theme ?? 'light',
		activeSection,
		feedback: consumeSettingsFeedback(req),
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
			? 'GitHub settings saved.'
			: section === 'shortcuts' ? 'Quick link limit saved.'
				: section === 'backups' ? 'Backup settings saved.' : 'General settings saved.';
		return redirectToSettings(req, res, section, { type: 'success', message });
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			return redirectToSettings(req, res, section, { type: 'error', message: error.message });
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
		return redirectToSettings(req, res, 'backups', { type: 'success', message: 'Backup created.' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not create backup.';
		return redirectToSettings(req, res, 'backups', { type: 'error', message });
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
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick links imported.' });
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: error.message });
		}
		throw error;
	}
}
