import 'dotenv-defaults/config';
import { applyPendingDatabaseBackupRestore } from '@/core/backup';
import { PinoLogger } from '@/logger/pinoLogger';

applyPendingDatabaseBackupRestore()
	.then(backup => {
		if (!backup) return;
		PinoLogger.info({
			scope: 'applyPendingDatabaseBackupRestore',
			message: 'Database backup restored before application startup',
			fileName: backup.fileName,
		});
	})
	.catch(error => {
		PinoLogger.error({
			scope: 'applyPendingDatabaseBackupRestore',
			message: 'Could not apply pending database backup restore',
			err: error,
		});
		process.exit(1);
	});
