import { runScheduledDatabaseBackup } from '@/core/backup';
import { CronExpression, Scheduler } from '@/primitives/scheduler';

Scheduler.on(CronExpression.EVERY_HOUR, runScheduledDatabaseBackup, {
	name: 'database-backup',
	noOverlap: true,
});
