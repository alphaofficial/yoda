import { Router } from 'express';
import { dashboardIndex, createShortcut } from '@/controllers/dashboard';
import { applyInertia } from '@/middleware/inertia';

const route = Router();

route.use(applyInertia);

route.get('/', dashboardIndex);
route.post('/api/shortcuts', createShortcut);

export default route;
