import { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';
import variables from '@/config/variables';
import { renderPage } from '@/primitives/inertia';
import { PinoLogger } from '@/logger/pinoLogger';

/**
 * 404 handler — renders an Inertia Error page if the request reached
 * past static + routes without matching anything.
 */
export const notFoundHandler: RequestHandler = async (req, res, next) => {
	try {
		if (!req.inertia) return next();
		await renderPage(req, res, 'Error' as any, {
			status: 404,
			message: 'Page not found',
		});
	} catch (err) {
		next(err);
	}
};

/**
 * Global error handler. Hides stack traces in production.
 */
export const globalErrorHandler: ErrorRequestHandler = (err, req: Request, res: Response, _next: NextFunction) => {
	const status = (err && (err.status || err.statusCode)) || 500;
	const isProd = variables.NODE_ENV === 'production';
	PinoLogger.error({
		scope: 'globalErrorHandler',
		message: 'Unhandled error',
		method: req.method,
		url: req.originalUrl,
		err,
	});
	if (res.headersSent) return;

	const payload = {
		status,
		message: isProd ? 'Something went wrong' : (err?.message || 'Unknown error'),
		...(isProd ? {} : { stack: err?.stack }),
	};

	if (req.inertia) {
		try {
			res.status(status);
			renderPage(req, res, 'Error' as any, payload).catch(() => {
				if (!res.headersSent) res.status(status).json({ error: payload.message });
			});
			return;
		} catch {
			// fall through
		}
	}

	res.status(status).json({ error: payload.message });
};
