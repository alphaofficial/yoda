import BetterQueue from 'better-queue';
import type { ProcessFunctionCb, QueueOptions } from 'better-queue';
import { PinoLogger } from '@/logger/pinoLogger';
import type { QueueDriver, QueueDriverHandler } from '@/primitives/queue';

interface QueueTask {
	jobName: string;
	payload: unknown;
}

interface InMemoryQueueState {
	handlers: ReadonlyMap<string, QueueDriverHandler> | null;
	queue: BetterQueue<QueueTask, unknown> | null;
}

/** Start the queue, registering handlers. Uses better-queue's built-in in-memory store. */
const start = (state: InMemoryQueueState, handlers: ReadonlyMap<string, QueueDriverHandler>): void => {
	if (state.queue) {
		return;
	}

	state.handlers = handlers;

	const process = (task: unknown, cb: ProcessFunctionCb<unknown>): void => {
		const t = task as QueueTask;
		const handler = state.handlers?.get(t.jobName);
		if (!handler) {
			PinoLogger.warn({ scope: 'inMemoryQueueDriver', message: 'No handler registered for job', jobName: t.jobName });
			cb(new Error(`No handler for job: ${t.jobName}`));
			return;
		}

		handler(t.payload).then(
			result => cb(null, result),
			err => cb(err as Error),
		);
	};

	const options: QueueOptions<QueueTask, unknown> = {
		process: process as QueueOptions<QueueTask, unknown>['process'],
		concurrent: 4,
		maxRetries: 3,
		retryDelay: 2000,
		id: 'jobName',
	};

	state.queue = new BetterQueue<QueueTask, unknown>(options);
};

/** Stop the queue, awaiting in-flight jobs. */
const stop = async (state: InMemoryQueueState): Promise<void> => {
	const queue = state.queue;
	if (!queue) {
		return;
	}

	state.queue = null;

	await new Promise<void>(resolve => {
		queue.destroy(() => resolve());
	});
};

/** Dispatch a job to the queue. */
const dispatch = (state: InMemoryQueueState, jobName: string, payload: unknown = {}): Promise<void> => {
	if (!state.queue) {
		PinoLogger.warn({ scope: 'dispatch', message: 'Queue not started — job dropped', jobName });
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		state.queue!.push({ jobName, payload }, (err: unknown) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve();
		});
	});
};

export function createInMemoryQueueDriver(): QueueDriver {
	const state: InMemoryQueueState = { handlers: null, queue: null };

	return {
		start: handlers => start(state, handlers),
		stop: () => stop(state),
		dispatch: (jobName, payload) => dispatch(state, jobName, payload),
	};
}
