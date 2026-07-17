import variables from '@/config/variables';
import { Bus } from '@/primitives/bus';
import { Cache } from '@/primitives/cache';
import { Mailer } from '@/primitives/mail';
import { Queue } from '@/primitives/queue';
import { Scheduler } from '@/primitives/scheduler';
import { Storage } from '@/primitives/storage';
import { createMemoryCacheDriver } from '@/runtime/drivers/cache/memory';
import { createInMemoryBusDriver } from '@/runtime/drivers/bus/inMemory';
import { createLogMailDriver } from '@/runtime/drivers/mail/log';
import { createSqliteQueueDriver } from '@/runtime/drivers/queue/sqlite';
import { createNodeCronSchedulerDriver } from '@/runtime/drivers/scheduler/nodeCron';
import { createLocalDiskDriver } from '@/runtime/drivers/storage/localDisk';
import { MikroORM } from '@mikro-orm/core';
import { AppContext, createApplicationCtx } from '@/runtime/context';


type Primitive = "bus" | "cache" | "mail" | "queue" | "scheduler" | "storage";

/**
 * Configure the primitive runtimes and load in-process registrations once.
 */
export function bootstrapPrimitives(ctx: AppContext, primitives?: Primitive[] ): void {
	if (!primitives || primitives.length === 0) {
		Bus.configure(createInMemoryBusDriver(), ctx);
		Cache.configure(createMemoryCacheDriver());
		Storage.configure(createLocalDiskDriver(variables.STORAGE_PATH, variables.APP_URL));
		Mailer.configure(createLogMailDriver());
		Queue.configure(createSqliteQueueDriver(ctx.db), ctx);
		Scheduler.configure(createNodeCronSchedulerDriver(), ctx);
	}

	if (primitives?.includes("bus")) {
		Bus.configure(createInMemoryBusDriver(), ctx);
	}

	if (primitives?.includes("cache")) {
		Cache.configure(createMemoryCacheDriver());
	}

	if (primitives?.includes("mail")) {
		Mailer.configure(createLogMailDriver());
	}

	if (primitives?.includes("queue")) {
		Queue.configure(createSqliteQueueDriver(ctx.db), ctx);
	}

	if (primitives?.includes("scheduler")) {
		Scheduler.configure(createNodeCronSchedulerDriver(), ctx);
	}

	if (primitives?.includes("storage")) {
		Storage.configure(createLocalDiskDriver(variables.STORAGE_PATH, variables.APP_URL));
	}
}
