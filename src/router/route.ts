import { Router } from 'express';
import { createShortcut, dashboardIndex, deleteShortcut, reorderShortcuts, updateShortcut } from '@/controllers/dashboard';
import { exportShortcuts, getGitHubRepositories, importShortcuts, settingsIndex, updateRepositories, updateSettings } from '@/controllers/settings';
import { applyInertia } from '@/middleware/inertia';

const route = Router();

route.use(applyInertia);

route.get('/', dashboardIndex);
route.get('/settings', settingsIndex);
route.patch('/settings', updateSettings);
route.get('/settings/shortcuts/export', exportShortcuts);
route.post('/settings/shortcuts/import', importShortcuts);
route.get('/settings/github/repositories', getGitHubRepositories);
route.put('/settings/github/repositories', updateRepositories);
route.post('/settings/shortcuts', createShortcut);
route.patch('/settings/shortcuts/:id', updateShortcut);
route.delete('/settings/shortcuts/:id', deleteShortcut);
route.put('/settings/shortcuts/reorder', reorderShortcuts);

export default route;
