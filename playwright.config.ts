import { defineConfig, devices } from "@playwright/test";

const E2E_APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "./test/integration/playwright",
	shard: { current: 1, total: 1 },
	use: {
		baseURL: E2E_APP_URL,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
		},
		{
			name: "mobile-chrome",
			use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
		},
	],
});
