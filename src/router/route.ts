import { Router } from 'express';
import { createShortcut, dashboardIndex, deleteShortcut, reorderShortcuts, updateShortcut } from '@/controllers/dashboard';
import { exportShortcuts, getGitHubRepositories, getSettings, importShortcuts, settingsIndex, updateRepositories, updateSettings } from '@/controllers/settings';
import { applyInertia } from '@/middleware/inertia';

const route = Router();

route.use(applyInertia);

route.get('/', dashboardIndex);
route.get('/settings', settingsIndex);
route.get('/api/settings', getSettings);
route.patch('/api/settings', updateSettings);
route.get('/api/settings/shortcuts/export', exportShortcuts);
route.post('/api/settings/shortcuts/import', importShortcuts);
route.put('/api/settings/repositories', updateRepositories);
route.get('/api/settings/github/repositories', getGitHubRepositories);
route.post('/api/shortcuts', createShortcut);
route.patch('/api/shortcuts/:id', updateShortcut);
route.delete('/api/shortcuts/:id', deleteShortcut);
route.put('/api/shortcuts/reorder', reorderShortcuts);

export default route;
