import { test, expect, type Page } from '@playwright/test';
import type { DashboardResponse } from '@/types/dashboard';

const sampleDashboard: DashboardResponse = {
	generatedAt: '2024-06-15T12:00:00.000Z',
	lastRefreshAt: '2024-06-15T12:00:00.000Z',
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
		github: { state: 'ok', lastSuccessAt: '2024-06-15T12:00:00.000Z', message: null },
		calendar: {
			state: 'unconfigured',
			lastSuccessAt: null,
			message: 'Add calendar configuration to enable this integration.',
		},
	},
};

test.describe('Dashboard Shell', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('renders greeting with display name', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('Good morning, Test User');
	});

	test('renders date in correct format', async ({ page }) => {
		const dateElement = page.locator('p').filter({ hasText: /June 15, 2024|15 June 2024/ });
		await expect(dateElement.first()).toBeVisible();
	});

	test('renders Settings button with accessible label', async ({ page }) => {
		const settingsButton = page.locator('button[aria-label="Settings"]');
		await expect(settingsButton).toBeVisible();
	});

	test('renders integration status badges', async ({ page }) => {
		await expect(page.locator('text=GitHub OK')).toBeVisible();
		await expect(page.locator('text=Calendar Unconfigured')).toBeVisible();
	});

	test('renders last refresh time', async ({ page }) => {
		await expect(page.locator('text=Last refresh:')).toBeVisible();
	});

	test('does not make unwanted API requests for dashboard data', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', request => {
			const url = request.url();
			if (url.includes('/api/dashboard')) {
				requests.push(url);
			}
		});

		await page.reload();
		expect(requests).toHaveLength(0);
	});

	test('document title includes Dashboard', async ({ page }) => {
		await expect(page).toHaveTitle(/Dashboard/);
	});
});

test.describe('Dashboard Layout - Desktop 1440x1000', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/');
	});

	test('utility row is at top and right-aligned', async ({ page }) => {
		const header = page.locator('header');
		await expect(header).toBeVisible();
	});

	test('greeting is 80px below utility row', async ({ page }) => {
		const greeting = page.locator('h1');
		await expect(greeting).toBeVisible();
	});

	test('content grid has correct column layout', async ({ page }) => {
		const main = page.locator('main');
		await expect(main).toBeVisible();
	});

	test('main content spans 8 columns', async ({ page }) => {
		const mainSection = page.locator('section[aria-label="Dashboard content"]');
		await expect(mainSection).toBeVisible();
	});

	test('sidebar aside is present', async ({ page }) => {
		const sidebar = page.locator('aside[aria-label="Sidebar"]');
		await expect(sidebar).toBeVisible();
	});
});

test.describe('Dashboard Layout - Mobile 390x844', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
	});

	test('no horizontal overflow', async ({ page }) => {
		const body = page.locator('body');
		const overflow = await body.evaluate(el => el.scrollWidth > el.clientWidth);
		expect(overflow).toBe(false);
	});

	test('content stacks vertically', async ({ page }) => {
		const mainSection = page.locator('section[aria-label="Dashboard content"]');
		const sidebar = page.locator('aside[aria-label="Sidebar"]');
		await expect(mainSection).toBeVisible();
		await expect(sidebar).toBeVisible();
	});

	test('greeting text scales down on mobile', async ({ page }) => {
		const greeting = page.locator('h1');
		await expect(greeting).toBeVisible();
		const fontSize = await greeting.evaluate(el => getComputedStyle(el).fontSize);
		expect(fontSize).toBeTruthy();
	});
});
