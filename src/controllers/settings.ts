import { type Request, type Response } from 'express';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { discoverGitHubRepositories } from '@/integrations/github';
import { invalidateDashboardSnapshot, primeDashboardSnapshot } from '@/core/dashboard';

function repository(req: Request) {
	return new DashboardConfigRepository(req.ctx.db.fork());
}

export async function settingsIndex(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	await primeDashboardSnapshot(config);
	return res.render('Settings', {
		settings: {
			displayName: config.displayName,
			timeZone: config.timeZone,
			shortcutLimit: config.shortcutLimit ?? 8,
			pullRequestWindowDays: config.github.windowDays ?? 7,
			githubTokenConfigured: !!config.githubToken,
			repositories: config.github.repositories,
			shortcutGroups: config.shortcutGroups,
		},
	});
}

export async function getSettings(req: Request, res: Response) {
	const config = await repository(req).getConfig();
	return res.json({
		displayName: config.displayName,
		timeZone: config.timeZone,
		shortcutLimit: config.shortcutLimit ?? 8,
		pullRequestWindowDays: config.github.windowDays ?? 7,
		githubTokenConfigured: !!config.githubToken,
		repositories: config.github.repositories,
	});
}

export async function updateSettings(req: Request, res: Response) {
	const config = await repository(req).updateSettings(req.body);
	await invalidateDashboardSnapshot(config);
	return res.json({
		displayName: config.displayName,
		timeZone: config.timeZone,
		shortcutLimit: config.shortcutLimit ?? 8,
		pullRequestWindowDays: config.github.windowDays ?? 7,
		githubTokenConfigured: !!config.githubToken,
		repositories: config.github.repositories,
	});
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
	const catalog = await discoverGitHubRepositories(token);
	return res.json({
		...catalog,
		selectedScopes: config.github.repositories.length > 0 ? config.github.repositories : catalog.defaultScopes,
	});
}
