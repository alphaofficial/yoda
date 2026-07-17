import crypto from 'crypto';
import { EntityManager } from '@mikro-orm/core';
import { PinoLogger } from '@/logger/pinoLogger';
import { QueueJob } from '@/models/QueueJob';
import type { QueueDriver, QueueDriverHandler } from '@/primitives/queue';

interface SqliteQueueDriverOptions {
	pollIntervalMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
	lockTimeoutMs?: number;
	workerId?: string;
}

interface SqliteQueueState {
	handlers: ReadonlyMap<string, QueueDriverHandler> | null;
	polling: boolean;
	stopped: boolean;
	timer: NodeJS.Timeout | null;
}

interface QueueJobRow {
	id: string;
	name: string;
	payload: string;
	attempts: number;
}

const defaultOptions = {
	pollIntervalMs: 500,
	maxRetries: 3,
	retryDelayMs: 2_000,
	lockTimeoutMs: 300_000,
};

const serializeError = (err: unknown): string => {
	const message = err instanceof Error ? err.stack || err.message : String(err);
	return message.slice(0, 2_000);
};

const claimNextJob = async (
	db: EntityManager,
	options: Required<Omit<SqliteQueueDriverOptions, 'workerId'>> & { workerId: string },
): Promise<QueueJobRow | null> => {
	const now = Date.now();
	const staleLockedAt = now - options.lockTimeoutMs;
	const job = await db.findOne(QueueJob, {
		$or: [
			{ status: 'pending', availableAt: { $lte: now } },
			{ status: 'running', lockedAt: { $lte: staleLockedAt } },
		],
	}, { orderBy: { createdAt: 'asc' } });

	if (!job) {
		return null;
	}

	const claimed = await db.nativeUpdate(QueueJob, {
		id: job.id,
		$or: [
			{ status: 'pending', availableAt: { $lte: now } },
			{ status: 'running', lockedAt: { $lte: staleLockedAt } },
		],
	}, {
		status: 'running',
		lockedAt: now,
		lockedBy: options.workerId,
		updatedAt: now,
	});

	if (claimed === 0) {
		return null;
	}

	return {
		id: job.id,
		name: job.name,
		payload: job.payload,
		attempts: job.attempts,
	};
};

const markDone = async (db: EntityManager, id: string): Promise<void> => {
	const now = Date.now();
	await db.nativeUpdate(QueueJob, { id }, {
		status: 'done',
		lockedAt: null,
		lockedBy: null,
		updatedAt: now,
	});
};

const markFailed = async (
	db: EntityManager,
	id: string,
	attempts: number,
	err: unknown,
	options: Required<Omit<SqliteQueueDriverOptions, 'workerId'>> & { workerId: string },
): Promise<void> => {
	const nextAttempts = attempts + 1;
	const now = Date.now();
	const finalFailure = nextAttempts >= options.maxRetries;

	await db.nativeUpdate(QueueJob, { id }, {
		status: finalFailure ? 'failed' : 'pending',
		attempts: nextAttempts,
		availableAt: finalFailure ? now : now + options.retryDelayMs * nextAttempts,
		lockedAt: null,
		lockedBy: null,
		lastError: serializeError(err),
		updatedAt: now,
	});
};

const processJob = async (
	db: EntityManager,
	handlers: ReadonlyMap<string, QueueDriverHandler>,
	job: QueueJobRow,
	options: Required<Omit<SqliteQueueDriverOptions, 'workerId'>> & { workerId: string },
): Promise<void> => {
	const handler = handlers.get(job.name);
	if (!handler) {
		PinoLogger.warn({ scope: 'sqliteQueueDriver', message: 'No handler registered for job', jobName: job.name });
		await markFailed(db, job.id, job.attempts, new Error(`No handler for job: ${job.name}`), options);
		return;
	}

	try {
		await handler(JSON.parse(job.payload));
		await markDone(db, job.id);
	} catch (err) {
		PinoLogger.error({ scope: 'sqliteQueueDriver', message: 'Job failed', jobName: job.name, jobId: job.id, err });
		await markFailed(db, job.id, job.attempts, err, options);
	}
};

const poll = async (
	db: EntityManager,
	state: SqliteQueueState,
	options: Required<Omit<SqliteQueueDriverOptions, 'workerId'>> & { workerId: string },
): Promise<void> => {
	if (state.polling || state.stopped || !state.handlers) {
		return;
	}

	state.polling = true;
	try {
		while (!state.stopped && state.handlers) {
			const job = await claimNextJob(db, options);
			if (!job) {
				break;
			}

			await processJob(db, state.handlers, job, options);
		}
	} finally {
		state.polling = false;
	}
};

const schedulePoll = (
	db: EntityManager,
	state: SqliteQueueState,
	options: Required<Omit<SqliteQueueDriverOptions, 'workerId'>> & { workerId: string },
): void => {
	state.timer = setInterval(() => {
		void poll(db, state, options);
	}, options.pollIntervalMs);
	state.timer.unref();
	void poll(db, state, options);
};

export function createSqliteQueueDriver(db: EntityManager, driverOptions: SqliteQueueDriverOptions = {}): QueueDriver {
	const options = {
		...defaultOptions,
		...driverOptions,
		workerId: driverOptions.workerId ?? `${process.pid}-${crypto.randomUUID()}`,
	};
	const state: SqliteQueueState = {
		handlers: null,
		polling: false,
		stopped: true,
		timer: null,
	};

	return {
		start: handlers => {
			if (state.timer) {
				return;
			}

			state.handlers = handlers;
			state.stopped = false;
			schedulePoll(db, state, options);
		},
		stop: async () => {
			state.stopped = true;
			if (state.timer) {
				clearInterval(state.timer);
				state.timer = null;
			}

			while (state.polling) {
				await new Promise(resolve => setTimeout(resolve, 25));
			}
		},
		dispatch: async (jobName, payload = {}) => {
			const now = Date.now();
			await db.insert(QueueJob, new QueueJob(crypto.randomUUID(), jobName, JSON.stringify(payload), now));
		},
	};
}
