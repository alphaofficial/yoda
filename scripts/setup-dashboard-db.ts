import "dotenv-defaults/config";
import { MikroORM } from "@mikro-orm/core";
import ormConfig from "@/database/orm.config";
import { DashboardRepository } from "@/repositories/DashboardRepository";
import { createApplicationCtx } from "@/runtime/context";
import { PinoLogger } from "@/logger/pinoLogger";

async function main() {
  const orm = await MikroORM.init(ormConfig);
  try {
    const ctx = createApplicationCtx(orm);
    const seeded = await DashboardRepository.seedFromJsonIfEmpty(ctx.db);
    if (seeded) {
      ctx.logger.info({
        scope: "setupDashboardDatabase",
        message: "Dashboard database seeded from config/dashboard.json",
      });
      return;
    }

    ctx.logger.info({
      scope: "setupDashboardDatabase",
      message: "Dashboard database already initialized",
    });
  } finally {
    await orm.close(true);
  }
}

main().catch((err) => {
  PinoLogger.error({
    scope: "setupDashboardDatabase",
    message: "Dashboard database setup failed",
    err,
  });
  process.exit(1);
});
