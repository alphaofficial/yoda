import { Queue } from '@/primitives/queue';
import { Scheduler } from '@/primitives/scheduler';
import ormConfig from '@/database/orm.config';
import { MikroORM } from '@mikro-orm/core';
import { bootstrapPrimitives } from '@/runtime/bootstrapPrimitives';
import { checkpointDatabase } from '@/core/backup';
import type { Disposable } from '@/primitives/shutdown';
import { createApplicationCtx } from './context';

let started = false;
let workerDisposables: readonly Disposable[] | null = null;

export async function startWorker(): Promise<readonly Disposable[]> {
	if (started && workerDisposables) return workerDisposables;

	const orm = await MikroORM.init(ormConfig);
	const ctx = createApplicationCtx(orm);
	const databaseConnection: Disposable = {
		async stop() {
			await checkpointDatabase(ctx.db);
			await ctx.db.getConnection().close(true);
		},
	};

	bootstrapPrimitives(ctx, ["queue", "scheduler"]);
	Queue.start();
	Scheduler.start();
	started = true;
	workerDisposables = [Scheduler, Queue, databaseConnection];

	return workerDisposables;
}
