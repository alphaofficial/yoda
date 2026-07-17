import 'dotenv-defaults/config';
import variables from '@/config/variables';
import { Bus } from '@/primitives/bus';
import { shutdown } from '@/primitives/shutdown';
import { createApp } from '@/router/app';
import { PinoLogger } from './logger/pinoLogger';
const port = variables.PORT;

async function bootstrap() {
  const scope = "ApplicationBootstrap";
  try {
    const { app, ctx } = await createApp();
    /** Starts the server */
    const server = app.listen(port, () => {
      PinoLogger.info({ scope: 'bootstrap', message: 'Server running', url: `http://localhost:${port}`, port });
    });

    /** Starts the event bus */
    Bus.start();

    /** Defines the cleanup functions for the application */
    const disposables = [
      { async stop() { server.close(); } },
      { async stop() { await ctx.db.getConnection().close(true) } }
    ];

    process.on('SIGTERM', () => void shutdown('SIGTERM', disposables));
    process.on('SIGINT', () => void shutdown('SIGINT', disposables));
  }
  catch (error) {
    PinoLogger.error({ scope, message: 'Failed to start the application', err: error });
    throw error;
  }
}

bootstrap().catch(_err => process.exit(1));
