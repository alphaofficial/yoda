import { PinoLogger } from "@/logger/pinoLogger";
import { EntityManager, MikroORM } from "@mikro-orm/core";

export type AppContext = {
    db: EntityManager;
    logger: typeof PinoLogger;
}

export function createApplicationCtx(orm: MikroORM): AppContext {
    return {
        db: orm.em.fork(),
        logger: PinoLogger,
    };
}
