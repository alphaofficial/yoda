import { PinoLogger } from '@/logger/pinoLogger';
import { AppContext } from '@/runtime/context';
import { loadRelativeDirectory } from '@/runtime/loadRelativeDirectory';
import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';
import type { RunCoordinator, TaskOptions } from 'node-cron';

export const CronExpression = Object.freeze({
	EVERY_SECOND: '* * * * * *',
	EVERY_5_SECONDS: '*/5 * * * * *',
	EVERY_10_SECONDS: '*/10 * * * * *',
	EVERY_30_SECONDS: '*/30 * * * * *',
	EVERY_MINUTE: '0 * * * * *',
	EVERY_5_MINUTES: '0 */5 * * * *',
	EVERY_10_MINUTES: '0 */10 * * * *',
	EVERY_30_MINUTES: '0 */30 * * * *',
	EVERY_HOUR: '0 0 * * * *',
	EVERY_DAY_AT_MIDNIGHT: '0 0 0 * * *',
	EVERY_DAY_AT_1AM: '0 0 1 * * *',
	EVERY_WEEK: '0 0 0 * * 0',
	EVERY_MONTH: '0 0 0 1 * *',
	EVERY_YEAR: '0 0 0 1 1 *',
});

export type CronExpression = (typeof CronExpression)[keyof typeof CronExpression];

export type SchedulerRunCoordinator = RunCoordinator;
export type SchedulerTaskOptions = TaskOptions;

export interface ScheduledTask {
	expression: CronExpression;
	handler: () => void | Promise<void>;
	options?: SchedulerTaskOptions;
	start(): void | Promise<void>;
	stop(): void | Promise<void>;
}

export interface SchedulerDriver {
	schedule(expression: CronExpression, handler: () => void | Promise<void>, options?: SchedulerTaskOptions): ScheduledTask;
	startAll(): void;
	stopAll(): void;
	getRegisteredTasks(): ReadonlyArray<{ expression: CronExpression; name?: string }>;
}

interface SchedulerRuntime {
	driver: SchedulerDriver;
	ctx: AppContext;
}

/** Configure the scheduler runtime. */
const configure = (driver: SchedulerDriver, ctx: AppContext): void => {
	if (hasPrimitiveRuntime('scheduler')) {
		return;
	}

	registerPrimitiveRuntime<SchedulerRuntime>('scheduler', {
		driver,
		ctx,
	});
};

/** Register a cron task. */
const on = (
	expression: CronExpression,
	handler: (ctx: AppContext) => void | Promise<void>,
	options?: SchedulerTaskOptions,
): ScheduledTask => {
	const runtime = getPrimitiveRuntime<SchedulerRuntime>('scheduler');

	return runtime.driver.schedule(expression, async () => {
		await handler(runtime.ctx);
	}, options);
};

/** Register a cron task. */
const schedule = (
	expression: CronExpression,
	handler: (ctx: AppContext) => void | Promise<void>,
	options?: SchedulerTaskOptions,
): ScheduledTask => {
	return on(expression, handler, options);
};

/** Start all registered tasks. */
const startAll = (): void => {
	getPrimitiveRuntime<SchedulerRuntime>('scheduler').driver.startAll();
};

/** Stop all registered tasks without logging lifecycle messages. */
const stopAll = (): void => {
	getPrimitiveRuntime<SchedulerRuntime>('scheduler').driver.stopAll();
};

/** List registered task expressions. */
const getRegisteredTasks = (): ReadonlyArray<{ expression: CronExpression; name?: string }> => {
	return getPrimitiveRuntime<SchedulerRuntime>('scheduler').driver.getRegisteredTasks();
};

/** Load scheduled tasks and start them. */
const start = (): void => {
	loadRelativeDirectory('scheduler');
	PinoLogger.info({ scope: 'start', message: 'Starting scheduler...' });
	startAll();
	const registered = getRegisteredTasks();
	PinoLogger.info({
		scope: 'start',
		message: 'Scheduler started', count: registered.length,
		tasks: registered.map(task => task.expression),
	});
};

/** Stop all registered tasks. */
const stop = (): void => {
	PinoLogger.info({ scope: 'stop', message: 'Stopping scheduler...' });
	stopAll();
	PinoLogger.info({ scope: 'stop', message: 'Scheduler stopped.' });
};

/**
 * Scheduler primitive for task scheduling
 */
export const Scheduler = Object.freeze({
	CronExpression,
	configure,
	on,
	schedule,
	start,
	startAll,
	stop,
	stopAll,
	getRegisteredTasks,
});
