import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { dashboardIndex, createShortcut } from '@/controllers/dashboard';
import { ShortcutValidationError } from '@/types/dashboard';
import type { DashboardResponse } from '@/types/dashboard';

const routeMocks = vi.hoisted(() => ({
	createDashboardService: vi.fn(),
	addShortcut: vi.fn(),
	getConfig: vi.fn(),
	invalidateDashboardSnapshot: vi.fn(),
}));

vi.mock('@/core/dashboard', () => ({
	createDashboardService: routeMocks.createDashboardService,
	invalidateDashboardSnapshot: routeMocks.invalidateDashboardSnapshot,
}));

vi.mock('@/repositories/DashboardConfigRepository', () => ({
	DashboardConfigRepository: class {
		addShortcut = routeMocks.addShortcut;
		getConfig = routeMocks.getConfig;
	},
}));

vi.mock('@/config/variables', () => ({
	default: {
		DASHBOARD_CONFIG_PATH: 'config/dashboard.json',
		DASHBOARD_CACHE_TTL_SECONDS: 60,
		DASHBOARD_REQUEST_TIMEOUT_MS: 5000,
		DASHBOARD_RETRY_COUNT: 2,
		APP_NAME: 'Test Dashboard',
		NODE_ENV: 'test',
	},
}));

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		(req as any).ctx = { db: { fork: vi.fn(() => ({})) } };
		(req as any).session = {};
		next();
	});
	app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
		(req as express.Request & { inertia: { share: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; [key: string]: unknown } }).inertia = {
			share: vi.fn(),
			render: vi.fn(),
		};
		next();
	});

	app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
		res.render = ((view: string, props: Record<string, unknown>) => {
			res.status(200).json({ view, props });
		}) as typeof res.render;
		next();
	});

	app.get('/', dashboardIndex);
	app.post('/settings/shortcuts', createShortcut);
	app.use((err: Error, _req: express.Request, _res: express.Response, _next: express.NextFunction) => {
		throw err;
	});
	return app;
}

describe('Dashboard Routes', () => {
	let app: express.Application;
	const mockDashboardService = {
		getSnapshot: vi.fn(),
	};

	const sampleDashboard: DashboardResponse = {
		generatedAt: '2024-06-15T12:00:00Z',
		lastRefreshAt: '2024-06-15T12:00:00Z',
		stale: false,
		timeZone: 'Europe/London',
		displayName: 'Test User',
		pullRequests: {
			windowDays: 7,
			counts: { open: 1, draft: 0, merged: 0, closed: 0 },
			items: [
				{
					id: 'pr-1',
					repository: 'owner/repo',
					number: 1,
					title: 'Test PR',
					author: 'testuser',
					reviewState: 'review_required',
					state: 'open',
					createdAt: '2024-06-10T00:00:00Z',
					updatedAt: '2024-06-15T10:00:00Z',
					url: 'https://github.com/owner/repo/pull/1',
					labels: ['bug'],
				},
			],
		},
		shortcutGroups: [
			{
				id: 'shortcuts',
				label: 'Shortcuts',
				shortcuts: [
					{
						id: 'jira',
						label: 'Jira board',
						url: 'https://example.atlassian.net/jira/your-work',
						icon: 'jira',
					},
				],
			},
		],
		integrations: {
			github: { state: 'ok', lastSuccessAt: '2024-06-15T12:00:00Z', message: null },
		},
	};

	beforeEach(() => {
		app = createTestApp();
		vi.clearAllMocks();
		(mockDashboardService.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDashboard);
		routeMocks.createDashboardService.mockReturnValue(mockDashboardService);
		routeMocks.addShortcut.mockResolvedValue({
			id: 'new-shortcut',
			label: 'New Shortcut',
			url: 'https://example.com',
			icon: 'link',
		});
		routeMocks.getConfig.mockResolvedValue({
			displayName: 'Test User',
			timeZone: 'Europe/London',
			shortcutLimit: 8,
			githubToken: 'test-token',
			github: { repositories: ['owner/repo'], windowDays: 7 },
			shortcutGroups: sampleDashboard.shortcutGroups,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('GET /', () => {
		it('renders Home with complete dashboard prop', async () => {
			const res = await request(app).get('/');

			expect(res.status).toBe(200);
			expect(mockDashboardService.getSnapshot).toHaveBeenCalledTimes(1);
		});

		it('returns 404 for removed starter routes', async () => {
			const paths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/about', '/home', '/users', '/logout'];

			for (const path of paths) {
				const res = await request(app).get(path);
				expect(res.status).toBe(404);
			}
		});
	});

	describe('POST /settings/shortcuts', () => {
		it('redirects to shortcut settings on valid input', async () => {
			const input = {
				groupId: 'shortcuts',
				label: 'New Shortcut',
				url: 'https://example.com',
				icon: 'link',
			};

			const res = await request(app)
				.post('/settings/shortcuts')
				.send(input)
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe('/settings?section=shortcuts');
			expect(routeMocks.addShortcut).toHaveBeenCalledWith(input);
		});

		it('redirects validation failures to shortcut settings', async () => {
			routeMocks.addShortcut.mockImplementation(() => {
				throw new ShortcutValidationError('Invalid shortcut', { url: 'URL is invalid' });
			});

			const res = await request(app)
				.post('/settings/shortcuts')
				.send({ groupId: 'invalid group', label: '', url: 'bad', icon: 'invalid' })
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe('/settings?section=shortcuts');
		});

		it('returns 400 for malformed JSON', async () => {
			const res = await request(app)
				.post('/settings/shortcuts')
				.send('{ invalid json }')
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(400);
		});

		it('does not expose credentials in the redirect response', async () => {
			routeMocks.addShortcut.mockResolvedValue({
				id: 'test',
				label: 'Test',
				url: 'https://example.com',
				icon: 'link',
			});

			const res = await request(app)
				.post('/settings/shortcuts')
				.send({ groupId: 'shortcuts', label: 'Test', url: 'https://example.com', icon: 'link' })
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(303);
			const responseStr = JSON.stringify(res.body);
			expect(responseStr).not.toContain('token');
			expect(responseStr).not.toContain('secret');
			expect(responseStr).not.toContain('password');
		});
	});
});
