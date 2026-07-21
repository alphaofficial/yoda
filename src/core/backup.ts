import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { EntityManager } from '@mikro-orm/core';
import variables from '@/config/variables';
import { DashboardRepository } from '@/repositories/DashboardRepository';
import type { AppContext } from '@/runtime/context';

const BACKUP_FILE_PATTERN = /^yoda-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.db$/;
const PENDING_RESTORE_FILE = '.pending-restore.json';

export interface DatabaseBackup {
	fileName: string;
	path: string;
	createdAt: Date;
}

export interface DatabaseBackupSummary {
	fileName: string;
	createdAt: string;
}

export interface BackupStatus {
	count: number;
	lastBackupAt: string | null;
	backups: DatabaseBackupSummary[];
}

interface PendingDatabaseRestore {
	fileName: string;
	requestedAt: string;
}

function backupFileName(now: Date): string {
	return `yoda-${now.toISOString().replace(/:/g, '-')}.db`;
}

function pendingRestorePath(backupPath = variables.BACKUP_PATH): string {
	return join(resolve(backupPath), PENDING_RESTORE_FILE);
}

function assertBackupFileName(fileName: string): void {
	if (!BACKUP_FILE_PATTERN.test(fileName)) {
		throw new Error('Invalid backup file.');
	}
}

async function findDatabaseBackup(fileName: string, backupPath = variables.BACKUP_PATH): Promise<DatabaseBackup> {
	assertBackupFileName(fileName);
	const backup = (await listDatabaseBackups(backupPath)).find(candidate => candidate.fileName === fileName);
	if (!backup) throw new Error('Backup was not found.');
	return backup;
}

export async function listDatabaseBackups(backupPath = variables.BACKUP_PATH): Promise<DatabaseBackup[]> {
	const directory = resolve(backupPath);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}

	const backups = await Promise.all(entries
		.filter(entry => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
		.map(async entry => {
			const path = join(directory, entry.name);
			const metadata = await stat(path);
			return { fileName: entry.name, path, createdAt: metadata.mtime };
		}));

	return backups.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function pruneDatabaseBackups(
	retentionDays: number,
	now = new Date(),
	backupPath = variables.BACKUP_PATH,
): Promise<number> {
	const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	const backups = await listDatabaseBackups(backupPath);
	const expired = backups.slice(1).filter(backup => backup.createdAt.getTime() < cutoff);
	await Promise.all(expired.map(backup => rm(backup.path)));
	return expired.length;
}

export async function createDatabaseBackup(
	db: EntityManager,
	retentionDays: number,
	now = new Date(),
	backupPath = variables.BACKUP_PATH,
	cleanUpExpired = true,
): Promise<DatabaseBackup> {
	const directory = resolve(backupPath);
	await mkdir(directory, { recursive: true });
	const path = join(directory, backupFileName(now));
	await db.getConnection().execute('vacuum into ?', [path]);
	if (cleanUpExpired) await pruneDatabaseBackups(retentionDays, now, backupPath);
	const metadata = await stat(path);
	return { fileName: backupFileName(now), path, createdAt: metadata.mtime };
}

export async function checkpointDatabase(db: EntityManager): Promise<void> {
	await db.getConnection().execute('pragma wal_checkpoint(truncate)');
}

export async function queueDatabaseBackupRestore(
	db: EntityManager,
	fileName: string,
	backupPath = variables.BACKUP_PATH,
): Promise<DatabaseBackup> {
	const backup = await findDatabaseBackup(fileName, backupPath);
	await checkpointDatabase(db);
	await writeFile(pendingRestorePath(backupPath), JSON.stringify({
		fileName: backup.fileName,
		requestedAt: new Date().toISOString(),
	} satisfies PendingDatabaseRestore, null, 2));
	return backup;
}

export async function applyPendingDatabaseBackupRestore(
	dbPath = variables.DB_PATH,
	backupPath = variables.BACKUP_PATH,
): Promise<DatabaseBackup | null> {
	const restorePath = pendingRestorePath(backupPath);
	let pending: PendingDatabaseRestore;
	try {
		pending = JSON.parse(await readFile(restorePath, 'utf8')) as PendingDatabaseRestore;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}

	const backup = await findDatabaseBackup(pending.fileName, backupPath);
	const databasePath = resolve(dbPath);
	await mkdir(dirname(databasePath), { recursive: true });
	await copyFile(backup.path, databasePath);
	await Promise.all([
		rm(`${databasePath}-wal`, { force: true }),
		rm(`${databasePath}-shm`, { force: true }),
	]);
	await rm(restorePath, { force: true });
	return backup;
}

export async function getBackupStatus(backupPath = variables.BACKUP_PATH): Promise<BackupStatus> {
	const backups = await listDatabaseBackups(backupPath);
	return {
		count: backups.length,
		lastBackupAt: backups[0]?.createdAt.toISOString() ?? null,
		backups: backups.map(backup => ({
			fileName: backup.fileName,
			createdAt: backup.createdAt.toISOString(),
		})),
	};
}

export async function runScheduledDatabaseBackup(
	ctx: AppContext,
	now = new Date(),
	backupPath = variables.BACKUP_PATH,
): Promise<void> {
	const db = ctx.db.fork();
	const policy = await DashboardRepository.getBackupPolicy(db);
	if (!policy) return;

	if (policy.intervalHours === 0) return;
	await pruneDatabaseBackups(policy.retentionDays, now, backupPath);

	const [latest] = await listDatabaseBackups(backupPath);
	const intervalMilliseconds = policy.intervalHours * 60 * 60 * 1000;
	if (latest && now.getTime() - latest.createdAt.getTime() < intervalMilliseconds) return;

	const backup = await createDatabaseBackup(db, policy.retentionDays, now, backupPath);
	ctx.logger.info({
		scope: 'runScheduledDatabaseBackup',
		message: 'Database backup created',
		fileName: backup.fileName,
	});
}
