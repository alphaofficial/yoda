import 'dotenv-defaults/config';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

const CONTAINER_NAME = 'yoda-e2e';
const IMAGE_NAME = 'yoda-e2e';

async function waitUntilReady(url: string): Promise<void> {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The image may still be applying migrations and starting the server.
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup(_config: FullConfig) {
	const configuredDatabasePath = process.env.E2E_DB_PATH ?? process.env.DB_PATH ?? 'yoda.db';
	const sourceDatabasePath = isAbsolute(configuredDatabasePath) ? configuredDatabasePath : resolve(process.cwd(), configuredDatabasePath);
	if (!existsSync(sourceDatabasePath)) throw new Error(`E2E source database does not exist: ${sourceDatabasePath}`);

	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'yoda-e2e-'));
	const testDatabasePath = join(temporaryDirectory, 'yoda.db');
	execFileSync('sqlite3', [sourceDatabasePath, `.backup ${testDatabasePath}`]);
	process.env.E2E_RUNTIME_DB_PATH = testDatabasePath;

	try {
		execFileSync('docker', ['container', 'rm', '--force', CONTAINER_NAME], { stdio: 'ignore' });
	} catch {
		// No previous E2E container exists.
	}

	try {
		execFileSync('docker', ['build', '--file', 'Dockerfile.test', '--tag', IMAGE_NAME, '.'], { stdio: 'inherit' });
		execFileSync('docker', [
			'run', '--detach', '--name', CONTAINER_NAME,
			'--publish', '127.0.0.1:3334:3334',
			'--volume', `${testDatabasePath}:/data/yoda.db`,
			'--env', 'NODE_ENV=production',
			'--env', 'PORT=3334',
			'--env', 'APP_URL=http://127.0.0.1:3334',
			'--env', 'APP_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
			'--env', 'SESSION_SECRET=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
			'--env', 'DB_PATH=/data/yoda.db',
			IMAGE_NAME,
		], { stdio: 'inherit' });
		await waitUntilReady('http://127.0.0.1:3334/readyz');
	} catch (error) {
		try {
			execFileSync('docker', ['logs', '--tail', '100', CONTAINER_NAME], { stdio: 'inherit' });
		} catch {
			// The container may have failed before it was created.
		}
		rmSync(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}

	return async () => {
		try {
			execFileSync('docker', ['container', 'rm', '--force', CONTAINER_NAME], { stdio: 'ignore' });
		} finally {
			rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	};
}
