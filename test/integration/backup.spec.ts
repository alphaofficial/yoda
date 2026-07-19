import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseBackup, listDatabaseBackups, pruneDatabaseBackups, runScheduledDatabaseBackup } from '@/core/backup';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'yoda-backup-test-'));
	temporaryDirectories.push(directory);
	return directory;
}

describe('database backups', () => {
	it('creates a SQLite backup in the configured directory', async () => {
		const directory = await temporaryDirectory();
		const execute = vi.fn(async (_sql: string, parameters: unknown[]) => {
			await writeFile(parameters[0] as string, 'sqlite backup');
		});
		const db = { getConnection: () => ({ execute }) };
		const now = new Date('2026-07-19T10:20:30.123Z');

		const backup = await createDatabaseBackup(db as never, 30, now, directory);

		expect(backup.fileName).toBe('yoda-2026-07-19T10-20-30.123Z.db');
		expect(await readFile(backup.path, 'utf8')).toBe('sqlite backup');
		expect(execute).toHaveBeenCalledWith('vacuum into ?', [backup.path]);
	});

	it('only removes owned backups older than the retention period', async () => {
		const directory = await temporaryDirectory();
		const oldBackup = join(directory, 'yoda-2026-06-01T00-00-00.000Z.db');
		const currentBackup = join(directory, 'yoda-2026-07-18T00-00-00.000Z.db');
		const unrelated = join(directory, 'keep-me.db');
		await Promise.all([writeFile(oldBackup, ''), writeFile(currentBackup, ''), writeFile(unrelated, '')]);
		await utimes(oldBackup, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z'));
		await utimes(currentBackup, new Date('2026-07-18T00:00:00Z'), new Date('2026-07-18T00:00:00Z'));

		expect(await pruneDatabaseBackups(30, new Date('2026-07-19T00:00:00Z'), directory)).toBe(1);
		expect((await listDatabaseBackups(directory)).map(backup => backup.path)).toEqual([currentBackup]);
		expect(await readFile(unrelated, 'utf8')).toBe('');
	});

	it('keeps the newest backup even when it is past retention', async () => {
		const directory = await temporaryDirectory();
		const lastBackup = join(directory, 'yoda-2026-06-01T00-00-00.000Z.db');
		await writeFile(lastBackup, 'last backup');
		await utimes(lastBackup, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z'));

		expect(await pruneDatabaseBackups(1, new Date('2026-07-19T00:00:00Z'), directory)).toBe(0);
		expect((await listDatabaseBackups(directory)).map(backup => backup.path)).toEqual([lastBackup]);
	});

	it('does not create another scheduled backup before the saved interval', async () => {
		const directory = await temporaryDirectory();
		const existing = join(directory, 'yoda-2026-07-19T11-30-00.000Z.db');
		await writeFile(existing, 'recent');
		await utimes(existing, new Date('2026-07-19T11:30:00Z'), new Date('2026-07-19T11:30:00Z'));
		const execute = vi.fn();
		const db = {
			findOne: vi.fn().mockResolvedValue({ backupIntervalHours: 1, backupRetentionDays: 30 }),
			getConnection: () => ({ execute }),
		};
		const ctx = {
			db: { fork: vi.fn(() => db) },
			logger: { info: vi.fn() },
		};

		await runScheduledDatabaseBackup(ctx as never, new Date('2026-07-19T12:00:00Z'), directory);

		expect(execute).not.toHaveBeenCalled();
	});

	it('does not create or clean up backups when scheduling is off', async () => {
		const directory = await temporaryDirectory();
		const existing = join(directory, 'yoda-2026-06-01T00-00-00.000Z.db');
		await writeFile(existing, 'existing');
		await utimes(existing, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z'));
		const execute = vi.fn();
		const db = {
			findOne: vi.fn().mockResolvedValue({ backupIntervalHours: 0, backupRetentionDays: 1 }),
			getConnection: () => ({ execute }),
		};
		const ctx = {
			db: { fork: vi.fn(() => db) },
			logger: { info: vi.fn() },
		};

		await runScheduledDatabaseBackup(ctx as never, new Date('2026-07-19T12:00:00Z'), directory);

		expect(execute).not.toHaveBeenCalled();
		expect((await listDatabaseBackups(directory)).map(backup => backup.path)).toEqual([existing]);
	});
});
