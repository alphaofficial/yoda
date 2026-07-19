import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { exportShortcuts, importShortcuts } from '@/controllers/settings';

const settingsMocks = vi.hoisted(() => ({
	getSettings: vi.fn(),
	importShortcuts: vi.fn(),
}));

vi.mock('@/core/dashboard', () => ({
	dashboard: {
		settings: settingsMocks.getSettings,
		importShortcuts: settingsMocks.importShortcuts,
	},
}));

vi.mock('@/config/variables', () => ({
	default: {
		DASHBOARD_CONFIG_PATH: 'config/dashboard.json',
		DASHBOARD_REQUEST_TIMEOUT_MS: 5000,
		DASHBOARD_RETRY_COUNT: 2,
	},
}));

const shortcutGroups = [{
	id: 'shortcuts',
	label: 'Shortcuts',
	shortcuts: [{ id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'github' as const }],
}];

const config = {
	displayName: 'Albert',
	timeZone: 'Europe/London',
	shortcutLimit: 8,
	githubToken: 'secret-token',
	github: { repositoryScopes: ['owner/repository'], windowDays: 7 },
	shortcutGroups,
};

function createApp() {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		(req as any).ctx = { db: { fork: vi.fn(() => ({})) } };
		(req as any).session = {};
		next();
	});
	app.get('/settings/shortcuts/export', exportShortcuts);
	app.post('/settings/shortcuts/import', importShortcuts);
	return app;
}

describe('shortcut settings transfer routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		settingsMocks.getSettings.mockResolvedValue(config);
		settingsMocks.importShortcuts.mockResolvedValue(config);
	});

	it('exports only shortcut groups', async () => {
		const response = await request(createApp()).get('/settings/shortcuts/export');

		expect(response.status).toBe(200);
		expect(response.headers['content-disposition']).toMatch(/^attachment; filename="yoda-shortcuts-\d{4}-\d{2}-\d{2}\.json"$/);
		expect(response.body.version).toBe(1);
		expect(response.body.shortcutGroups).toEqual(shortcutGroups);
		expect(JSON.stringify(response.body)).not.toContain('secret-token');
		expect(JSON.stringify(response.body)).not.toContain('repositories');
	});

	it('imports shortcut groups', async () => {
		const payload = { version: 1, exportedAt: '2026-07-18T12:00:00.000Z', shortcutGroups };
		const response = await request(createApp())
			.post('/settings/shortcuts/import')
			.send(payload);

		expect(response.status).toBe(303);
		expect(response.headers.location).toBe('/settings?section=shortcuts');
		expect(settingsMocks.importShortcuts).toHaveBeenCalledWith(expect.any(Object), shortcutGroups);
	});

	it('rejects an invalid shortcut export', async () => {
		const response = await request(createApp())
			.post('/settings/shortcuts/import')
			.send({ version: 9, shortcutGroups: [] });

		expect(response.status).toBe(303);
		expect(response.headers.location).toBe('/settings?section=shortcuts');
		expect(settingsMocks.importShortcuts).not.toHaveBeenCalled();
	});
});
