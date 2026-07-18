import { type Request, type Response } from 'express';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { invalidateDashboardSnapshot, primeDashboardSnapshot } from '@/core/dashboard';
import { getGitHubRepositoryCatalog } from '@/core/githubRepositories';
import { createShortcutSettingsExport, validateShortcutSettingsImport } from '@/config/dashboard';
import { DashboardConfigError } from '@/types/dashboard';
import type { DashboardConfig } from '@/types/dashboard';
import { consumeSettingsFeedback, redirectToSettings, type SettingsSection } from '@/controllers/settingsRedirect';

function repository(req: Request) {
	return new DashboardConfigRepository(req.ctx.db.fork());
}

function settingsResponse(config: DashboardConfig) {
	return {
		displayName: config.displayName,
		timeZone: config.timeZone,
		timeFormat: config.timeFormat ?? '12',
		theme: config.theme ?? 'light',
		shortcutLimit: config.shortcutLimit ?? 8,
		pullRequestWindowDays: config.github.windowDays ?? 7,
		githubTokenConfigured: !!config.githubToken,
		repositories: config.github.repositories,
		shortcutGroups: config.shortcutGroups,
	};
}

export async function settingsIndex(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	await primeDashboardSnapshot(config);
	const requestedSection = typeof req.query.section === 'string' ? req.query.section : '';
	const activeSection: SettingsSection = requestedSection === 'github' || requestedSection === 'shortcuts' ? requestedSection : 'general';
	let catalog;
	let repositoryError = '';
	if (activeSection === 'github' && config.githubToken) {
		try {
			catalog = await getGitHubRepositoryCatalog(config.githubToken, req.query.refresh === '1');
		} catch (error) {
			repositoryError = error instanceof Error ? error.message : 'Could not load repositories from GitHub.';
		}
	}
	return res.render('Settings', {
		_theme: config.theme ?? 'light',
		activeSection,
		feedback: consumeSettingsFeedback(req),
		repositoryCatalog: catalog ? {
			...catalog,
			selectedScopes: config.github.repositories.length > 0 ? config.github.repositories : catalog.defaultScopes,
		} : null,
		repositoryError,
		settings: settingsResponse(config),
	});
}

export async function updateSettings(req: Request, res: Response) {
	const requestedSection = typeof req.query.section === 'string' ? req.query.section : '';
	const section: SettingsSection = requestedSection === 'github' || requestedSection === 'shortcuts' ? requestedSection : 'general';
	try {
		const configRepository = repository(req);
		await configRepository.updateSettings(req.body);
		if (Array.isArray(req.body.repositories)) {
			await configRepository.setRepositories(req.body.repositories);
		}
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		const message = section === 'github'
			? 'GitHub settings saved.'
			: section === 'shortcuts' ? 'Shortcut display limit saved.' : 'General settings saved.';
		return redirectToSettings(req, res, section, { type: 'success', message });
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			return redirectToSettings(req, res, section, { type: 'error', message: error.message });
		}
		throw error;
	}
}

export async function exportShortcuts(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	const exported = createShortcutSettingsExport(config.shortcutGroups);
	const date = exported.exportedAt.slice(0, 10);
	res.attachment(`yoda-shortcuts-${date}.json`);
	return res.json(exported);
}

export async function importShortcuts(req: Request, res: Response) {
	try {
		const imported = validateShortcutSettingsImport(req.body);
		const configRepository = repository(req);
		const config = await configRepository.importShortcuts(imported);
		await invalidateDashboardSnapshot(config);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Shortcuts imported. Existing shortcuts were replaced.' });
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: error.message });
		}
		throw error;
	}
}
