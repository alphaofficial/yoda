import express from 'express';
import session from 'express-session';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import routes from '@/router/route';
import ormConfig from '@/database/orm.config';
import { PinoLogger } from '@/logger/pinoLogger';
import variables from '@/config/variables';
import { SessionStore, generateSessionToken } from '@/middleware/sessionStore';
import { verifyOrigin } from '@/middleware/csrf';
import { notFoundHandler, globalErrorHandler } from '@/middleware/errorHandler';
import { bootstrapPrimitives } from '@/runtime/bootstrapPrimitives';
import { createApplicationCtx } from '@/runtime/context';

/**
 * Build the Express application and its shared ORM instance.
 */
export async function createApp() {
	const orm = await MikroORM.init(ormConfig);
	const sessionStore = new SessionStore(orm);
	const app = express();
	const ctx = createApplicationCtx(orm);

	/** Sets the trust proxy option */
	app.set('trust proxy', variables.TRUST_PROXY);

	/** Allows each request to receive a fresh ORM context */
	app.use((_, __, next) => RequestContext.create(ctx.db.fork(), next));

	/** Allows each request to receive the application context */
	app.use((req, _res, next) => {
		req.ctx = ctx;
		next();
	});
	
	/** Makes the application primitives ready for usage */
	bootstrapPrimitives(ctx);

	/** Adds helmet security headers.
	 *  CSP is production-only to avoid blocking dev tooling.
	 */
	app.use(
		helmet({
			contentSecurityPolicy: variables.NODE_ENV === 'production' ? undefined : false,
		}),
	);

	/** Compresses text responses before to reduce bytes sent over the network  */
	app.use(compression());


	/** Confirms the http process is running */
	app.get('/healthz', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	/** Confirms the app can reach the database before receiving traffic */
	app.get('/readyz', async (_req, res) => {
		try {
			await ctx.db.getConnection().execute('select 1');
			res.status(200).json({ status: 'ready' });
		} catch {
			res.status(503).json({ status: 'not_ready' });
		}
	});

	/** Adds request metadata to the session store for session persistence/auditing. */
	app.use((req, _, next) => {
		if (req.sessionID) {
			sessionStore.setRequestData(req.sessionID, req.ip || '', req.get('User-Agent') || '');
		}
		next();
	});

	/** Configures the session middleware */
	app.use(
		session({
			store: sessionStore,
			secret: variables.SESSION_SECRET,
			genid: generateSessionToken,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: variables.NODE_ENV === 'production',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: variables.SESSION_MAX_AGE,
			},
		}),
	);

	/** Injects authentication helpers into each request */
	app.use((req, _, next) => {
		const { injectAuthHelpers } = require('@/middleware/authUtils');
		injectAuthHelpers(req, _, next);
	});

	/** Parses JSON request bodies with a limit to prevent oversized payloads. */
	app.use(express.json({ limit: '100kb' }));
	/** Parses form submissions with a limit so standard HTML forms work without accepting huge bodies. */
	app.use(express.urlencoded({ extended: true, limit: '100kb' }));
	/** Logs each HTTP request and response. */
	app.use(PinoLogger.instance);
	/** Serves public assets from disk. */
	app.use('/', express.static(path.join(process.cwd(), 'public')));
	/** Rejects unsafe cross-origin state-changing requests before they reach routes. */
	app.use(verifyOrigin);
	/** Registers app routes */
	app.use('/', routes);
	/** Handles 404 errors */
	app.use(notFoundHandler);
	/** Handles global errors */
	app.use(globalErrorHandler);

	return { app, ctx };
}
