import { PinoLogger } from '@/logger/pinoLogger';

export interface Disposable {
	stop(): void | Promise<void>;
}

let shuttingDown = false;

/**
 * Stop a set of disposables in response to a process signal.
 */
export async function shutdown(
	signal: 'SIGTERM' | 'SIGINT',
	disposables: Disposable[] = [],
	timeoutMs = 10_000,
) {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	PinoLogger.info({ scope: 'shutdown', message: 'Received signal, shutting down', signal });

	const timeout = setTimeout(() => process.exit(1), timeoutMs);
	timeout.unref();

	try {
		for (const disposable of disposables) {
			await disposable.stop();
		}

		clearTimeout(timeout);
		process.exit(0);
	} catch (err: any) {
		PinoLogger.error({
			scope: 'shutdown',
			message: 'Shutdown failed',
			err,
		});
		process.exit(1);
	}
}
