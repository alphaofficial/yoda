import { type Request, type Response, type NextFunction } from 'express';
import { getDashboardService } from '@/core/dashboard';
import { addShortcut } from '@/config/dashboard';
import { ShortcutValidationError } from '@/types/dashboard';
import variables from '@/config/variables';

export async function dashboardIndex(req: Request, res: Response, next: NextFunction) {
	try {
		const dashboardService = getDashboardService();
		const dashboard = await dashboardService.getSnapshot();
		return res.render('Home', { dashboard });
	} catch (err) {
		next(err);
	}
}

export async function createShortcut(req: Request, res: Response, next: NextFunction) {
	try {
		const validated = req.body;

		const shortcut = await addShortcut(validated, variables.DASHBOARD_CONFIG_PATH);

		res.status(201).json({ shortcut });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return res.status(422).json({ error: 'Invalid shortcut', fields: err.fields });
		}
		next(err);
	}
}
