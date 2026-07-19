import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import type { DashboardResponse, GitHubRepositoryCatalog } from '@/types/dashboard';

interface HomePageProps {
	dashboard: DashboardResponse;
}

interface SettingsPageProps {
	repositoryCatalog: (GitHubRepositoryCatalog & { selectedScopes: string[] }) | null;
	settings: {
		repositoryScopes: string[];
	};
}

interface PersistedFilter {
	filter: 'status' | 'involved' | 'repo' | 'title' | 'id';
	value: string;
	operator: 'AND' | 'OR';
}

async function initialPageProps<T>(page: Page): Promise<T> {
	return page.locator('#app').evaluate<T>(element => {
		const value = element.getAttribute('data-page');
		if (!value) throw new Error('Missing Inertia page data');
		return JSON.parse(value).props as T;
	});
}

async function removeFilterIfPresent(page: Page, name: string): Promise<void> {
	const button = page.getByRole('button', { name: `Remove ${name} filter` });
	if (await button.isVisible()) await button.click();
}

async function clearDefaultFilters(page: Page): Promise<void> {
	await removeFilterIfPresent(page, 'Open');
	await removeFilterIfPresent(page, 'True');
}

async function chooseFilter(page: Page, property: 'Status' | 'Involved' | 'Repository' | 'Title' | 'ID', value: string): Promise<void> {
	await page.getByRole('button', { name: 'Add pull request filter' }).click();
	await page.getByRole('option', { name: property, exact: true }).click();
	const input = page.getByRole('textbox', { name: 'Search and filter pull requests' });
	const propertyName = property === 'Status' ? 'status' : property === 'Involved' ? 'involved' : property === 'Repository' ? 'repo' : property.toLowerCase();
	await expect(input).toHaveValue(`${propertyName}:`);
	if (property === 'Title' || property === 'ID') {
		await input.fill(`${propertyName}:${value}`);
		await input.press('Enter');
		return;
	}
	await page.getByRole('option', { name: value, exact: true }).click();
}

function statusLabel(state: DashboardResponse['pullRequests']['items'][number]['state']): string {
	return state[0].toUpperCase() + state.slice(1);
}

function repositoryMatchesScope(repository: string, scope: string): boolean {
	if (scope.endsWith('/*')) return repository.toLowerCase().startsWith(`${scope.slice(0, -2).toLowerCase()}/`);
	return repository.toLowerCase() === scope.toLowerCase();
}

function fuzzyMatch(value: string, query: string): boolean {
	const haystack = value.toLowerCase();
	let position = 0;
	for (const character of query.toLowerCase().trim()) {
		position = haystack.indexOf(character, position);
		if (position < 0) return false;
		position++;
	}
	return true;
}

async function applyPersistedFilters(page: Page, filters: PersistedFilter[], inputValue = ''): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.context().addCookies([{
		name: 'yoda_pull_request_filters',
		value: encodeURIComponent(JSON.stringify({ filters, inputValue })),
		url: origin,
	}]);
	await page.reload();
}

async function visiblePullRequestIds(page: Page): Promise<string[]> {
	return page.locator('[data-pull-request-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-pull-request-id')!));
}

function savedGitHubToken(): string {
	const databasePath = process.env.E2E_RUNTIME_DB_PATH;
	if (!databasePath) throw new Error('Missing E2E runtime database path');
	const token = execFileSync('sqlite3', [databasePath, 'select github_token from dashboard_settings limit 1'], { encoding: 'utf8' }).trim();
	if (!token) throw new Error('The E2E database does not contain a GitHub token');
	return token;
}

async function searchGitHubPullRequestIds(token: string, searchQuery: string): Promise<string[]> {
	const ids: string[] = [];
	let cursor: string | null = null;
	do {
		const response = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: JSON.stringify({
				query: `query($query: String!, $cursor: String) {
					search(query: $query, type: ISSUE, first: 100, after: $cursor) {
						nodes { ... on PullRequest { id } }
						pageInfo { endCursor hasNextPage }
					}
				}`,
				variables: { query: searchQuery, cursor },
			}),
		});
		const body = await response.json() as {
			data?: { search?: { nodes: Array<{ id?: string }>; pageInfo: { endCursor: string | null; hasNextPage: boolean } } };
			errors?: Array<{ message: string }>;
		};
		if (!response.ok || body.errors?.length || !body.data?.search) throw new Error(`GitHub search failed: ${response.status} ${body.errors?.map(error => error.message).join(', ') ?? ''}`);
		ids.push(...body.data.search.nodes.flatMap(node => node.id ? [node.id] : []));
		cursor = body.data.search.pageInfo.hasNextPage ? body.data.search.pageInfo.endCursor : null;
	} while (cursor);
	return ids;
}

test.describe.serial('Docker dashboard end to end', () => {
	test('loads the body font on the initial visit', async ({ page }) => {
		const fontResponse = page.waitForResponse(response => response.url().endsWith('/fonts/cal-sans-ui-variable.woff2'));
		await page.goto('/settings?section=backups');
		expect((await fontResponse).ok()).toBe(true);
		await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Cal Sans UI"'))).toBe(true);
		expect(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Cal Sans UI');
	});

	test('persists backup settings and creates a backup on demand', async ({ page }) => {
		await page.goto('/settings?section=backups');
		await page.getByLabel('Backup frequency').selectOption('6');
		await page.getByLabel('Retention (days)').fill('14');
		await Promise.all([
			page.waitForResponse(response => response.url().includes('/settings?section=backups') && response.request().method() === 'PATCH'),
			page.getByRole('button', { name: 'Save settings' }).click(),
		]);

		await page.reload();
		await expect(page.getByLabel('Backup frequency')).toHaveValue('6');
		await expect(page.getByLabel('Retention (days)')).toHaveValue('14');
		await Promise.all([
			page.waitForResponse(response => response.url().endsWith('/settings/backups') && response.request().method() === 'POST'),
			page.getByRole('button', { name: 'Back up now' }).click(),
		]);
		await page.reload();
		await expect(page.getByText('1 backup', { exact: true })).toBeVisible();
		await expect(page.getByText(/^Latest /)).toBeVisible();
	});

	test('loads real GitHub data with the saved database token and reuses the PR cache', async ({ page }) => {
		const startedAt = Date.now();
		await page.goto('/');
		const firstLoadMilliseconds = Date.now() - startedAt;
		const first = await initialPageProps<HomePageProps>(page);

		expect(firstLoadMilliseconds).toBeLessThan(30_000);
		expect(first.dashboard.githubTokenConfigured).toBe(true);
		expect(first.dashboard.integrations.github.state).toBe('ok');
		expect(first.dashboard.pullRequests.items.length).toBeGreaterThan(0);

		const reloadStartedAt = Date.now();
		await page.reload();
		const reloadMilliseconds = Date.now() - reloadStartedAt;
		const cached = await initialPageProps<HomePageProps>(page);

		expect(reloadMilliseconds).toBeLessThan(3_000);
		expect(cached.dashboard.lastRefreshAt).toBe(first.dashboard.lastRefreshAt);
		expect(cached.dashboard.pullRequests.items).toEqual(first.dashboard.pullRequests.items);
	});

	test('fills clicked filters into the search, filters actual PRs, autocompletes typing, and persists on reload', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		await expect(page.locator('[data-filter="status:open"]')).toBeVisible();
		await expect(page.locator('[data-filter="involved:true"]')).toBeVisible();
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const item = dashboard.pullRequests.items[0];
		await clearDefaultFilters(page);

		await chooseFilter(page, 'Status', statusLabel(item.state));
		await expect(page.locator(`[data-filter="status:${item.state}"]`)).toBeVisible();
		await expect(page.getByText(item.title, { exact: true }).first()).toBeVisible();

		await page.getByRole('button', { name: `Remove ${statusLabel(item.state)} filter` }).click();
		const input = page.getByRole('textbox', { name: 'Search and filter pull requests' });
		await input.fill('sta');
		await page.getByRole('option', { name: 'Status', exact: true }).click();
		await expect(input).toHaveValue('status:');
		await input.type(item.state.slice(0, 2));
		await page.getByRole('option', { name: statusLabel(item.state), exact: true }).click();
		await expect(page.locator(`[data-filter="status:${item.state}"]`)).toBeVisible();
		await chooseFilter(page, 'Involved', 'False');

		await page.reload();
		await expect(page.locator(`[data-filter="status:${item.state}"]`)).toBeVisible();
		await expect(page.locator('[data-filter="involved:false"]')).toBeVisible();
	});

	test('fuzzy filters titles locally, supports spaces, and persists on reload', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const item = dashboard.pullRequests.items.find(candidate => candidate.title.trim().split(/\s+/).length >= 3)
			?? dashboard.pullRequests.items[0];
		const query = item.title.trim().split(/\s+/).slice(0, 3).map(word => word[0]).join(' ');
		const expectedIds = dashboard.pullRequests.items
			.filter(candidate => fuzzyMatch(candidate.title, query))
			.slice(0, 10)
			.map(candidate => candidate.id);
		await clearDefaultFilters(page);

		const requests: string[] = [];
		page.on('request', request => requests.push(request.url()));
		await chooseFilter(page, 'Title', query);

		await expect(page.locator('[data-filter^="title:"]')).toHaveAttribute('data-filter', `title:${query}`);
		await expect(page.getByRole('textbox', { name: 'Search and filter pull requests' })).toHaveValue('');
		expect(await visiblePullRequestIds(page)).toEqual(expectedIds);
		expect(requests).toEqual([]);

		await page.reload();
		await expect(page.locator('[data-filter^="title:"]')).toHaveAttribute('data-filter', `title:${query}`);
		expect(await visiblePullRequestIds(page)).toEqual(expectedIds);
	});

	test('filters by pull request number locally', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const item = dashboard.pullRequests.items[0];
		const expectedIds = dashboard.pullRequests.items
			.filter(candidate => candidate.number === item.number)
			.slice(0, 10)
			.map(candidate => candidate.id);
		await clearDefaultFilters(page);

		const requests: string[] = [];
		page.on('request', request => requests.push(request.url()));
		await chooseFilter(page, 'ID', String(item.number));

		await expect(page.locator('[data-filter^="id:"]')).toHaveAttribute('data-filter', `id:${item.number}`);
		expect(await visiblePullRequestIds(page)).toEqual(expectedIds);
		expect(requests).toEqual([]);
	});

	test('opens the filter menu from the input and anchors it at the input point', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const input = page.getByRole('textbox', { name: 'Search and filter pull requests' });
		await input.click();
		const menu = page.getByRole('listbox');
		await expect(menu).toBeVisible();
		await expect(page.getByRole('option', { name: 'Status', exact: true })).toBeVisible();
		const [inputBox, menuBox] = await Promise.all([input.boundingBox(), menu.boundingBox()]);
		expect(inputBox).not.toBeNull();
		expect(menuBox).not.toBeNull();
		expect(Math.abs(menuBox!.x - inputBox!.x)).toBeLessThanOrEqual(2);
	});

	test('changes the exact applied filter value when its chip is clicked', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const statusChip = page.getByRole('button', { name: 'Change Status filter value' });
		await statusChip.click();
		const input = page.getByRole('textbox', { name: 'Search and filter pull requests' });
		await expect(input).toHaveValue('');
		const [chipBox, menuBox] = await Promise.all([statusChip.boundingBox(), page.getByRole('listbox').boundingBox()]);
		expect(chipBox).not.toBeNull();
		expect(menuBox).not.toBeNull();
		expect(Math.abs(menuBox!.x - chipBox!.x)).toBeLessThanOrEqual(2);
		await page.getByRole('option', { name: 'Merged', exact: true }).click();
		await expect(page.locator('[data-filter="status:merged"]')).toBeVisible();
		await expect(page.locator('[data-filter="status:open"]')).not.toBeVisible();

		await applyPersistedFilters(page, [
			{ filter: 'status', value: 'open', operator: 'AND' },
			{ filter: 'status', value: 'merged', operator: 'OR' },
		]);
		await page.getByRole('button', { name: 'Change Status filter value' }).nth(1).click();
		await page.getByRole('option', { name: 'Closed', exact: true }).click();
		await expect(page.locator('[data-filter="status:open"]')).toBeVisible();
		await expect(page.locator('[data-filter="status:closed"]')).toBeVisible();
		await expect(page.locator('[data-filter="status:merged"]')).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Remove OR before Closed' })).toBeVisible();
	});

	test('partitions open pull requests by whether the authenticated user is involved', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const openItems = dashboard.pullRequests.items.filter(item => item.state === 'open');
		const involvedItems = openItems.filter(item => item.involved);
		const notInvolvedItems = openItems.filter(item => !item.involved);
		expect(involvedItems.length + notInvolvedItems.length).toBe(openItems.length);
		expect(dashboard.pullRequests.items.every(item => typeof item.involved === 'boolean')).toBe(true);

		await clearDefaultFilters(page);
		await chooseFilter(page, 'Status', 'Open');
		await chooseFilter(page, 'Involved', 'True');
		await expect(page.locator('[data-pull-request-id]')).toHaveCount(Math.min(involvedItems.length, 10));

		await chooseFilter(page, 'Involved', 'False');
		await expect(page.locator('[data-pull-request-id]')).toHaveCount(Math.min(notInvolvedItems.length, 10));
	});

	test('matches involvement flags to the union of independent real GitHub searches', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/settings?section=github');
		const settings = await initialPageProps<SettingsPageProps>(page);
		expect(settings.repositoryCatalog).not.toBeNull();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const items = dashboard.pullRequests.items;
		const repositories = Array.from(new Set(items.map(item => item.repository)));
		const catalog = settings.repositoryCatalog!;
		const cutoff = new Date(Date.now() - dashboard.pullRequests.windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const involvementQualifiers = [
			`involves:${catalog.viewerLogin}`,
			`review-requested:${catalog.viewerLogin}`,
			`reviewed-by:${catalog.viewerLogin}`,
			...catalog.teams.map(team => `team-review-requested:${team}`),
		];
		const token = savedGitHubToken();
		const independentlyInvolved = new Set<string>();
		for (const repository of repositories) {
			for (const qualifier of involvementQualifiers) {
				const ids = await searchGitHubPullRequestIds(token, `is:pr updated:>=${cutoff} repo:${repository} ${qualifier}`);
				ids.forEach(id => independentlyInvolved.add(id));
			}
		}
		const fetchedIds = new Set(items.map(item => item.id));
		const expectedIds = Array.from(independentlyInvolved).filter(id => fetchedIds.has(id)).sort();
		const actualIds = items.filter(item => item.involved).map(item => item.id).sort();
		expect(actualIds).toEqual(expectedIds);
	});

	test('renders the complete status, involvement, and repository AND-filter matrix', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const items = dashboard.pullRequests.items;
		const statuses = ['open', 'draft', 'merged', 'closed'] as const;
		const repositories = Array.from(new Set(items.map(item => item.repository))).sort();

		for (const repository of [null, ...repositories]) {
			for (const status of statuses) {
				for (const involved of [true, false]) {
					const filters: PersistedFilter[] = [
						{ filter: 'status', value: status, operator: 'AND' },
						{ filter: 'involved', value: String(involved), operator: 'AND' },
					];
					if (repository) filters.push({ filter: 'repo', value: repository, operator: 'AND' });
					await applyPersistedFilters(page, filters);

					const expectedIds = items
						.filter(item => item.state === status && item.involved === involved && (!repository || item.repository === repository))
						.slice(0, 10)
						.map(item => item.id);
					expect(await visiblePullRequestIds(page), `${status}, involved:${involved}, repo:${repository ?? 'all'}`).toEqual(expectedIds);
				}
			}
		}
	});

	test('renders OR combinations using the same real pull-request dataset', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		const items = dashboard.pullRequests.items;

		await applyPersistedFilters(page, [
			{ filter: 'status', value: 'open', operator: 'AND' },
			{ filter: 'status', value: 'merged', operator: 'OR' },
		]);
		expect(await visiblePullRequestIds(page)).toEqual(items.filter(item => item.state === 'open' || item.state === 'merged').slice(0, 10).map(item => item.id));

		await applyPersistedFilters(page, [
			{ filter: 'involved', value: 'true', operator: 'AND' },
			{ filter: 'involved', value: 'false', operator: 'OR' },
		]);
		expect(await visiblePullRequestIds(page)).toEqual(items.slice(0, 10).map(item => item.id));

		const repositories = Array.from(new Set(items.map(item => item.repository))).sort();
		if (repositories.length > 1) {
			await applyPersistedFilters(page, [
				{ filter: 'repo', value: repositories[0], operator: 'AND' },
				{ filter: 'repo', value: repositories[1], operator: 'OR' },
			]);
			expect(await visiblePullRequestIds(page)).toEqual(items.filter(item => repositories.slice(0, 2).includes(item.repository)).slice(0, 10).map(item => item.id));
		}
	});

	test('adds and removes pending and applied OR operators', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');

		await page.getByRole('button', { name: 'Add pull request filter' }).click();
		await page.getByRole('option', { name: 'OR', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Remove pending OR operator' })).toBeVisible();
		await page.getByRole('button', { name: 'Remove pending OR operator' }).click();
		await expect(page.getByRole('button', { name: 'Remove pending OR operator' })).not.toBeVisible();

		await page.getByRole('button', { name: 'Add pull request filter' }).click();
		await page.getByRole('option', { name: 'OR', exact: true }).click();
		await chooseFilter(page, 'Status', 'Merged');
		await expect(page.getByRole('button', { name: 'Remove OR before Merged' })).toBeVisible();
		await page.getByRole('button', { name: 'Remove OR before Merged' }).click();
		await expect(page.getByRole('button', { name: 'Remove OR before Merged' })).not.toBeVisible();
	});

	test('repository filters only narrow PRs already allowed by the Settings scopes', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/settings?section=github');
		const settings = await initialPageProps<SettingsPageProps>(page);
		expect(settings.repositoryCatalog).not.toBeNull();
		const selectedScopes = settings.repositoryCatalog!.selectedScopes;
		expect(selectedScopes.length).toBeGreaterThan(0);

		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		expect(dashboard.pullRequests.items.length).toBeGreaterThan(0);
		for (const item of dashboard.pullRequests.items) {
			expect(selectedScopes.some(scope => repositoryMatchesScope(item.repository, scope))).toBe(true);
		}

		await clearDefaultFilters(page);
		const item = dashboard.pullRequests.items[0];
		await chooseFilter(page, 'Repository', item.repository);
		await expect(page.locator(`[data-filter="repo:${item.repository}"]`)).toBeVisible();
		await expect(page.getByText(item.title, { exact: true }).first()).toBeVisible();
		for (const other of dashboard.pullRequests.items.filter(candidate => candidate.repository !== item.repository).slice(0, 3)) {
			await expect(page.getByText(other.title, { exact: true })).not.toBeVisible();
		}
	});

	test('force refresh fetches fresh GitHub data and replaces the cached result', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const before = await initialPageProps<HomePageProps>(page);
		const refreshStartedAt = Date.now();

		await Promise.all([
			page.waitForResponse(response => response.url().endsWith('/pull-requests/refresh') && response.request().method() === 'POST'),
			page.getByRole('button', { name: 'Refresh pull requests' }).click(),
		]);
		await expect(page.getByRole('button', { name: 'Refresh pull requests' })).toBeEnabled();
		expect(Date.now() - refreshStartedAt).toBeLessThan(60_000);

		await page.reload();
		const after = await initialPageProps<HomePageProps>(page);
		expect(after.dashboard.integrations.github.state).toBe('ok');
		expect(after.dashboard.lastRefreshAt).not.toBe(before.dashboard.lastRefreshAt);
	});

	test('paginates actual results when more than one page is returned', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		const { dashboard } = await initialPageProps<HomePageProps>(page);
		await clearDefaultFilters(page);

		if (dashboard.pullRequests.items.length > 10) {
			await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
			await page.getByRole('button', { name: 'Next pull request page' }).click();
			await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
		} else {
			await expect(page.getByRole('button', { name: 'Next pull request page' })).not.toBeVisible();
		}
	});

	test('has no horizontal overflow on mobile with real dashboard data', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		const overflow = await page.locator('body').evaluate(element => element.scrollWidth > element.clientWidth);
		expect(overflow).toBe(false);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});
});
