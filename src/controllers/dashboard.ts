import { type Request, type Response } from 'express';
import { createDashboardService, invalidateDashboardSnapshot } from '@/core/dashboard';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { redirectToSettings } from '@/controllers/settingsRedirect';
import { ShortcutValidationError } from '@/types/dashboard';

export async function dashboardIndex(req: Request, res: Response) {
	const dashboardService = createDashboardService({
		configRepository: new DashboardConfigRepository(req.ctx.db.fork()),
	});
	const dashboard = await dashboardService.getSnapshot();
	return res.render('Home', { _theme: dashboard.theme ?? 'light', dashboard });
}

export async function createShortcut(req: Request, res: Response) {
	try {
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		await configRepository.addShortcut(req.body);
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Shortcut added.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function importBookmarkShortcuts(req: Request, res: Response) {
	try {
		const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
		const shortcuts = Array.isArray(req.body.shortcuts)
			? req.body.shortcuts.map((shortcut: { label?: unknown; url?: unknown }) => ({
				groupId,
				label: typeof shortcut.label === 'string' ? shortcut.label : '',
				url: typeof shortcut.url === 'string' ? shortcut.url : '',
				icon: 'link' as const,
			}))
			: [];
		if (shortcuts.length === 0) {
			throw new ShortcutValidationError('Choose at least one bookmark');
		}
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		const importedCount = await configRepository.addShortcuts(shortcuts);
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		const message = importedCount === 0
			? 'Those bookmarks are already shortcuts.'
			: `${importedCount} bookmark${importedCount === 1 ? '' : 's'} imported.`;
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function updateShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		await configRepository.updateShortcut(shortcutId, req.body);
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Shortcut updated.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function deleteShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		await configRepository.deleteShortcut(shortcutId);
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Shortcut removed.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function reorderShortcuts(req: Request, res: Response) {
	try {
		const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
		const shortcutIds = Array.isArray(req.body.shortcutIds)
			? req.body.shortcutIds.filter((id: unknown): id is string => typeof id === 'string')
			: [];
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		await configRepository.reorderShortcuts(groupId, shortcutIds);
		const config = await configRepository.getConfig();
		await invalidateDashboardSnapshot(config);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Shortcut order saved.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}
