import variables from '@/config/variables';
import { PinoLogger } from '@/logger/pinoLogger';
import { Session } from '@/models/Session';
import { AppContext } from '@/runtime/context';

export async function cleanExpiredSessions(ctx: AppContext): Promise<void> {
	const maxAgeSeconds = Math.floor(variables.SESSION_MAX_AGE / 1000);
	const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
	const deleted = await ctx.db.nativeDelete(Session, { last_activity: { $lte: cutoff } });

	if (deleted > 0) {
		PinoLogger.info({
			scope: 'cleanExpiredSessions',
			message: 'Cleaned expired sessions', deleted,
		});
	}
}
