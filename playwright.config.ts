import { defineConfig, devices } from '@playwright/test';

const E2E_APP_URL = process.env.E2E_APP_URL ?? 'http://127.0.0.1:3334';

export default defineConfig({
	testDir: './test/integration/playwright',
	globalSetup: './test/integration/playwright/globalSetup.ts',
	workers: 1,
	shard: { current: 1, total: 1 },
	use: {
		baseURL: E2E_APP_URL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
		},
	],
});
