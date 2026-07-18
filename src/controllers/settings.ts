import { type Request, type Response } from 'express';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { invalidateDashboardSnapshot, primeDashboardSnapshot } from '@/core/dashboard';
import { getCachedGitHubRepositoryCatalog, getGitHubRepositoryCatalog } from '@/core/githubRepositories';
import { createShortcutSettingsExport, validateShortcutSettingsImport } from '@/config/dashboard';
import { DashboardConfigError } from '@/types/dashboard';
import type { DashboardConfig } from '@/types/dashboard';

function repository(req: Request) {
	return new DashboardConfigRepository(req.ctx.db.fork());
}

function settingsResponse(config: DashboardConfig) {
	return {
		displayName: config.displayName,
		timeZone: config.timeZone,
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
	const activeSection = ['general', 'github', 'shortcuts'].includes(requestedSection) ? requestedSection : 'general';
	const catalog = activeSection === 'github' && config.githubToken
		? await getCachedGitHubRepositoryCatalog(config.githubToken)
		: undefined;
	return res.render('Settings', {
		activeSection,
		repositoryCatalog: catalog ? {
			...catalog,
			selectedScopes: config.github.repositories.length > 0 ? config.github.repositories : catalog.defaultScopes,
		} : null,
		settings: settingsResponse(config),
	});
}

export async function getSettings(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	return res.json(settingsResponse(config));
}

export async function updateSettings(req: Request, res: Response) {
	const config = await repository(req).updateSettings(req.body);
	await invalidateDashboardSnapshot(config);
	return res.json(settingsResponse(config));
}

export async function exportShortcuts(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	const exported = createShortcutSettingsExport(config.shortcutGroups);
	const date = exported.exportedAt.slice(0, 10);
	res.attachment(`personal-dashboard-shortcuts-${date}.json`);
	return res.json(exported);
}

export async function importShortcuts(req: Request, res: Response) {
	try {
		const imported = validateShortcutSettingsImport(req.body);
		const configRepository = repository(req);
		const config = await configRepository.importShortcuts(imported);
		await invalidateDashboardSnapshot(config);
		return res.json({ shortcutGroups: config.shortcutGroups });
	} catch (error) {
		if (error instanceof DashboardConfigError) {
			return res.status(422).json({ error: error.message, fields: error.fields });
		}
		throw error;
	}
}

export async function updateRepositories(req: Request, res: Response) {
	const repositories = Array.isArray(req.body.repositories) ? req.body.repositories : [];
	const configRepository = repository(req);
	await configRepository.setRepositories(repositories);
	await invalidateDashboardSnapshot(await configRepository.getConfig());
	return res.json({ repositories });
}

export async function getGitHubRepositories(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	const token = config.githubToken;
	if (!token) return res.status(401).json({ error: 'GitHub token is not configured' });
	const catalog = await getGitHubRepositoryCatalog(token, req.query.refresh === '1');
	return res.json({
		...catalog,
		selectedScopes: config.github.repositories.length > 0 ? config.github.repositories : catalog.defaultScopes,
	});
}
