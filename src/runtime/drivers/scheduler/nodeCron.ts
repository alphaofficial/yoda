import * as cron from 'node-cron';
import type { ScheduledTask as CronTask } from 'node-cron';
import { PinoLogger } from '@/logger/pinoLogger';
import type { CronExpression, ScheduledTask, SchedulerDriver, SchedulerTaskOptions } from '@/primitives/scheduler';

interface NodeCronTask extends ScheduledTask {
	task: CronTask;
}

interface NodeCronSchedulerState {
	tasks: NodeCronTask[];
}

const createScheduledTask = (
	state: NodeCronSchedulerState,
	expression: CronExpression,
	handler: () => void | Promise<void>,
	options?: SchedulerTaskOptions,
): ScheduledTask => {
	if (!cron.validate(expression)) {
		throw new Error(`Invalid cron expression: "${expression}"`);
	}

	const runTask = async (): Promise<void> => {
		try {
			await handler();
		} catch (err) {
			PinoLogger.error({ scope: 'nodeCronSchedulerDriver', message: 'Cron task failed', expression, err });
		}
	};

	const task = cron.createTask(expression, runTask, options);
	const scheduledTask: NodeCronTask = {
		expression,
		handler,
		options,
		task,
		start: () => task.start(),
		stop: () => task.stop(),
	};

	state.tasks.push(scheduledTask);
	return scheduledTask;
};

export function createNodeCronSchedulerDriver(): SchedulerDriver {
	const state: NodeCronSchedulerState = { tasks: [] };

	return {
		schedule: (expression, handler, options) => createScheduledTask(state, expression, handler, options),
		startAll: () => {
			state.tasks.forEach(entry => entry.task.start());
		},
		stopAll: () => {
			state.tasks.forEach(entry => entry.task.stop());
		},
		getRegisteredTasks: () => state.tasks.map(task => ({ expression: task.expression, name: task.options?.name })),
	};
}
