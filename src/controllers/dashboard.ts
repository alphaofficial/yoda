import { type Request, type Response } from 'express';
import { dashboard } from '@/core/dashboard';
import { redirectToSettings } from '@/controllers/settingsRedirect';
import { ShortcutValidationError } from '@/types/dashboard';

const PULL_REQUEST_FILTER_COOKIE = 'yoda_pull_request_filters';

function getCookie(req: Request, name: string): string | null {
	const entry = req.headers.cookie?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${name}=`));
	if (!entry) return null;
	try {
		return decodeURIComponent(entry.slice(name.length + 1)).slice(0, 4000);
	} catch {
		return null;
	}
}

export async function dashboardIndex(req: Request, res: Response) {
	const dashboardData = await dashboard.get(req.ctx.db, new Date());
	return res.render('Home', {
		theme: dashboardData.theme ?? 'light',
		dashboard: dashboardData,
		pullRequestFilterState: getCookie(req, PULL_REQUEST_FILTER_COOKIE),
	});
}

export async function refreshPullRequests(req: Request, res: Response) {
	await dashboard.refreshPullRequests(req.ctx.db, new Date());
	return res.redirect(303, '/');
}

export async function createShortcut(req: Request, res: Response) {
	try {
		await dashboard.addShortcut(req.ctx.db, req.body);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link added.' });
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
			}))
			: [];
		if (shortcuts.length === 0) {
			throw new ShortcutValidationError('Choose at least one bookmark');
		}
		const importedCount = await dashboard.addShortcuts(req.ctx.db, shortcuts);
		const message = importedCount === 0
			? 'Those bookmarks are already quick links.'
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
		await dashboard.updateShortcut(req.ctx.db, shortcutId, req.body);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link updated.' });
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
		await dashboard.deleteShortcut(req.ctx.db, shortcutId);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link removed.' });
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
		await dashboard.reorderShortcuts(req.ctx.db, groupId, shortcutIds);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link order saved.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}
