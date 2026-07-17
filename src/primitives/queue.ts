import { AppContext } from '@/runtime/context';
import { loadRelativeDirectory } from '@/runtime/loadRelativeDirectory';
import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';

export type QueueHandler<T = unknown> = (ctx: AppContext, payload: T) => Promise<void>;
export type QueueDriverHandler<T = unknown> = (payload: T) => Promise<void>;

export interface QueueDriver {
	start(handlers: ReadonlyMap<string, QueueDriverHandler>): void | Promise<void>;
	stop(): Promise<void>;
	dispatch(jobName: string, payload?: unknown): Promise<void>;
}

interface QueueRuntime {
	driver: QueueDriver;
	ctx: AppContext;
	handlers: Map<string, QueueDriverHandler>;
}

/** Configure the queue driver. */
const configure = (driver: QueueDriver, ctx: AppContext): void => {
	if (hasPrimitiveRuntime('queue')) {
		return;
	}

	registerPrimitiveRuntime<QueueRuntime>('queue', {
		driver,
		ctx,
		handlers: new Map(),
	});
};

/** Register a job handler. */
const on = <T = unknown>(name: string, handler: QueueHandler<T>): void => {
	const runtime = getPrimitiveRuntime<QueueRuntime>('queue');

	runtime.handlers.set(name, async payload => {
		await handler(runtime.ctx, payload as T);
	});
};

/** Load jobs and start the queue driver. */
const start = (): void => {
	loadRelativeDirectory('jobs');
	const runtime = getPrimitiveRuntime<QueueRuntime>('queue');
	void runtime.driver.start(runtime.handlers);
};

/** Stop the queue driver. */
const stop = async (): Promise<void> => {
	await getPrimitiveRuntime<QueueRuntime>('queue').driver.stop();
};

/** Dispatch a job to the queue. */
const dispatch = async (jobName: string, payload: unknown = {}): Promise<void> => {
	await getPrimitiveRuntime<QueueRuntime>('queue').driver.dispatch(jobName, payload);
};

/**
 * Queue primitive for registering background consumers and dispatching jobs.
 */
export const Queue = Object.freeze({
	configure,
	on,
	start,
	stop,
	dispatch,
});
