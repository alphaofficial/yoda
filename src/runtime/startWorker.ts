import { Queue } from '@/primitives/queue';
import { Scheduler } from '@/primitives/scheduler';
import ormConfig from '@/database/orm.config';
import { MikroORM } from '@mikro-orm/core';
import { bootstrapPrimitives } from '@/runtime/bootstrapPrimitives';
import { createApplicationCtx } from './context';

let started = false;

export async function startWorker() {
	if (started) {
		return [Scheduler, Queue] as const;
	}

	const orm = await MikroORM.init(ormConfig);
	const ctx = createApplicationCtx(orm);

	bootstrapPrimitives(ctx, ["queue", "scheduler"]);
	Queue.start();
	Scheduler.start();
	started = true;

	return [Scheduler, Queue] as const;
}
