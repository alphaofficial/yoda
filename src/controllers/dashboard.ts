import { type Request, type Response } from 'express';
import { dashboard } from '@/core/dashboard';
import { messages } from '@/config/messages';

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
	const [, error] = await dashboard.addShortcut(req.ctx.db, req.body);
	if (error) {
		req.session.flash = { message: error.message };
		return res.redirect(303, '/settings?section=shortcuts');
	}
	req.session.flash = { message: messages.shortcuts.added };
	return res.redirect(303, '/settings?section=shortcuts');
}

export async function importBookmarkShortcuts(req: Request, res: Response) {
	const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
	const shortcuts = Array.isArray(req.body.shortcuts)
		? req.body.shortcuts.map((shortcut: { label?: unknown; url?: unknown }) => ({
			groupId,
			label: typeof shortcut.label === 'string' ? shortcut.label : '',
			url: typeof shortcut.url === 'string' ? shortcut.url : '',
		}))
		: [];
	const [, error] = await dashboard.addShortcuts(req.ctx.db, shortcuts);
	if (error) {
		req.session.flash = { message: error.message };
		return res.redirect(303, '/settings?section=shortcuts');
	}
	req.session.flash = { message: messages.bookmarks.imported };
	return res.redirect(303, '/settings?section=shortcuts');
}

export async function updateShortcut(req: Request, res: Response) {
	const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const [, error] = await dashboard.updateShortcut(req.ctx.db, shortcutId, req.body);
	if (error) {
		req.session.flash = { message: error.message };
		return res.redirect(303, '/settings?section=shortcuts');
	}
	req.session.flash = { message: messages.shortcuts.updated };
	return res.redirect(303, '/settings?section=shortcuts');
}

export async function deleteShortcut(req: Request, res: Response) {
	const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const [, error] = await dashboard.deleteShortcut(req.ctx.db, shortcutId);
	if (error) {
		req.session.flash = { message: error.message };
		return res.redirect(303, '/settings?section=shortcuts');
	}
	req.session.flash = { message: messages.shortcuts.removed };
	return res.redirect(303, '/settings?section=shortcuts');
}

export async function reorderShortcuts(req: Request, res: Response) {
	const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
	const shortcutIds = Array.isArray(req.body.shortcutIds)
		? req.body.shortcutIds.filter((id: unknown): id is string => typeof id === 'string')
		: [];
	const [, error] = await dashboard.reorderShortcuts(req.ctx.db, groupId, shortcutIds);
	if (error) {
		req.session.flash = { message: error.message };
		return res.redirect(303, '/settings?section=shortcuts');
	}
	req.session.flash = { message: messages.shortcuts.orderSaved };
	return res.redirect(303, '/settings?section=shortcuts');
}
