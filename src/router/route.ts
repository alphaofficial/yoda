import { Router } from 'express';
import { createShortcut, dashboardIndex, deleteShortcut, importBookmarkShortcuts, refreshPullRequests, reorderShortcuts, updateShortcut } from '@/controllers/dashboard';
import { createBackup, exportShortcuts, importShortcuts, settingsIndex, updateSettings } from '@/controllers/settings';
import { applyInertia } from '@/middleware/inertia';

const route = Router();

route.use(applyInertia);

route.get('/', dashboardIndex);
route.post('/pull-requests/refresh', refreshPullRequests);
route.get('/settings', settingsIndex);
route.patch('/settings', updateSettings);
route.post('/settings/backups', createBackup);
route.get('/settings/shortcuts/export', exportShortcuts);
route.post('/settings/shortcuts/import', importShortcuts);
route.post('/settings/shortcuts', createShortcut);
route.post('/settings/shortcuts/bookmarks', importBookmarkShortcuts);
route.patch('/settings/shortcuts/:id', updateShortcut);
route.delete('/settings/shortcuts/:id', deleteShortcut);
route.put('/settings/shortcuts/reorder', reorderShortcuts);

export default route;
