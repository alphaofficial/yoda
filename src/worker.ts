import 'dotenv-defaults/config';
import { shutdown } from '@/primitives/shutdown';
import { startWorker } from '@/runtime/startWorker';

async function bootstrap() {
	const disposables = await startWorker();

	process.on('SIGTERM', () => void shutdown('SIGTERM', [...disposables]));
	process.on('SIGINT', () => void shutdown('SIGINT', [...disposables]));
}

bootstrap().catch(err => {
	console.error(err);
	process.exit(1);
});
