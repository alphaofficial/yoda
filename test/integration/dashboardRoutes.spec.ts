import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { dashboardIndex, createShortcut } from '@/controllers/dashboard';
import { ShortcutValidationError } from '@/types/dashboard';
import type { DashboardResponse } from '@/types/dashboard';

vi.mock('@/core/dashboard', () => ({
	getDashboardService: vi.fn(),
}));

vi.mock('@/config/dashboard', () => ({
	addShortcut: vi.fn(),
}));

vi.mock('@/config/variables', () => ({
	default: {
		DASHBOARD_CONFIG_PATH: 'config/dashboard.json',
		DASHBOARD_CACHE_TTL_SECONDS: 60,
		DASHBOARD_REQUEST_TIMEOUT_MS: 5000,
		DASHBOARD_RETRY_COUNT: 2,
		GITHUB_TOKEN: 'test-token',
		GOOGLE_CLIENT_ID: 'test-client-id',
		GOOGLE_CLIENT_SECRET: 'test-client-secret',
		GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
		APP_NAME: 'Test Dashboard',
		NODE_ENV: 'test',
		SESSION_SECRET: 'test-secret',
	},
}));

import { getDashboardService } from '@/core/dashboard';
import { addShortcut } from '@/config/dashboard';

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use(
		session({
			secret: 'test-secret',
			resave: false,
			saveUninitialized: false,
		})
	);

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
	app.post('/api/shortcuts', createShortcut);
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
	const mockAddShortcut = addShortcut as ReturnType<typeof vi.fn>;

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
		calendar: { today: [], upcoming: [] },
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
			calendar: { state: 'unconfigured', lastSuccessAt: null, message: 'Add calendar configuration to enable this integration.' },
		},
	};

	beforeEach(() => {
		app = createTestApp();
		vi.clearAllMocks();
		(mockDashboardService.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDashboard);
		(getDashboardService as ReturnType<typeof vi.fn>).mockReturnValue(mockDashboardService);
		mockAddShortcut.mockResolvedValue({
			id: 'new-shortcut',
			label: 'New Shortcut',
			url: 'https://example.com',
			icon: 'link',
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

	describe('GET /api/dashboard', () => {
		it('returns 404', async () => {
			const res = await request(app).get('/api/dashboard');
			expect(res.status).toBe(404);
		});
	});

	describe('POST /api/dashboard/refresh', () => {
		it('returns 404', async () => {
			const res = await request(app).post('/api/dashboard/refresh');
			expect(res.status).toBe(404);
		});
	});

	describe('POST /api/shortcuts', () => {
		it('returns 201 with shortcut on valid input', async () => {
			const input = {
				groupId: 'shortcuts',
				label: 'New Shortcut',
				url: 'https://example.com',
				icon: 'link',
			};

			const res = await request(app)
				.post('/api/shortcuts')
				.send(input)
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(201);
			expect(res.body).toEqual({
				shortcut: {
					id: 'new-shortcut',
					label: 'New Shortcut',
					url: 'https://example.com',
					icon: 'link',
				},
			});
			expect(mockAddShortcut).toHaveBeenCalledWith(input, 'config/dashboard.json');
		});

		it('returns 422 with field errors on validation failure', async () => {
			mockAddShortcut.mockImplementation(() => {
				throw new ShortcutValidationError('Invalid shortcut', { url: 'URL is invalid' });
			});

			const res = await request(app)
				.post('/api/shortcuts')
				.send({ groupId: 'invalid group', label: '', url: 'bad', icon: 'invalid' })
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(422);
			expect(res.body).toEqual({
				error: 'Invalid shortcut',
				fields: { url: 'URL is invalid' },
			});
		});

		it('returns 400 for malformed JSON', async () => {
			const res = await request(app)
				.post('/api/shortcuts')
				.send('{ invalid json }')
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(400);
		});

		it('does not expose credentials in response', async () => {
			mockAddShortcut.mockResolvedValue({
				id: 'test',
				label: 'Test',
				url: 'https://example.com',
				icon: 'link',
			});

			const res = await request(app)
				.post('/api/shortcuts')
				.send({ groupId: 'shortcuts', label: 'Test', url: 'https://example.com', icon: 'link' })
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json');

			expect(res.status).toBe(201);
			const responseStr = JSON.stringify(res.body);
			expect(responseStr).not.toContain('token');
			expect(responseStr).not.toContain('secret');
			expect(responseStr).not.toContain('password');
		});
	});
});
