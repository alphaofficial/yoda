import { type Request, type Response } from 'express';
import { createDashboardService, invalidateDashboardSnapshot } from '@/core/dashboard';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';
import { ShortcutValidationError } from '@/types/dashboard';

export async function dashboardIndex(req: Request, res: Response) {
	const dashboardService = createDashboardService({
		configRepository: new DashboardConfigRepository(req.ctx.db.fork()),
	});
	const dashboard = await dashboardService.getSnapshot();
	return res.render('Home', { dashboard });
}

export async function createShortcut(req: Request, res: Response) {
	try {
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		const shortcut = await configRepository.addShortcut(req.body);
		await invalidateDashboardSnapshot(await configRepository.getConfig());
		res.status(201).json({ shortcut });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return res.status(422).json({ error: 'Invalid shortcut', fields: err.fields });
		}
		throw err;
	}
}

export async function updateShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		const shortcut = await configRepository.updateShortcut(shortcutId, req.body);
		await invalidateDashboardSnapshot(await configRepository.getConfig());
		return res.json({ shortcut });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return res.status(422).json({ error: 'Invalid shortcut', fields: err.fields });
		}
		throw err;
	}
}

export async function deleteShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const configRepository = new DashboardConfigRepository(req.ctx.db.fork());
		await configRepository.deleteShortcut(shortcutId);
		await invalidateDashboardSnapshot(await configRepository.getConfig());
		return res.status(204).send();
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return res.status(404).json({ error: 'Shortcut not found', fields: err.fields });
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
		const shortcuts = await configRepository.reorderShortcuts(groupId, shortcutIds);
		await invalidateDashboardSnapshot(await configRepository.getConfig());
		return res.json({ shortcuts });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return res.status(422).json({ error: 'Invalid shortcut order', fields: err.fields });
		}
		throw err;
	}
}
