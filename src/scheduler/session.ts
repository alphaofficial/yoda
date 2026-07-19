import { cleanExpiredSessions } from '@/core/session';
import { CronExpression, Scheduler } from '@/primitives/scheduler';

Scheduler.on(CronExpression.EVERY_HOUR, cleanExpiredSessions, {
	name: 'expired-session-cleanup',
	noOverlap: true,
});
