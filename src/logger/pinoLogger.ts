import pino, { type Logger, type LoggerOptions } from 'pino';
import { pinoHttp, stdSerializers, type HttpLogger } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

const baseOptions: LoggerOptions = {
	serializers: {
		...stdSerializers,
		req: (req: IncomingMessage & { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }) => ({
			method: req.method,
			url: req.url,
			userAgent: req.headers['user-agent'],
		}),
		res: (res: ServerResponse & { statusCode: number }) => ({
			statusCode: res.statusCode,
		}),
		error: stdSerializers.err,
	},
	formatters: {
		level(level: string) {
			return { level };
		},
	},
};

const httpOptions = {
	customLogLevel: (_req: unknown, res: { statusCode: number }, err: unknown) => {
		if (res.statusCode >= 400 && res.statusCode < 500) {
			return 'warn';
		}
		if (res.statusCode >= 500 || err) {
			return 'error';
		}
		if (res.statusCode >= 300 && res.statusCode < 400) {
			return 'silent';
		}
		return 'info';
	},
	customSuccessMessage: (req: { method?: string; originalUrl?: string; statusCode?: number }, _res: unknown) => {
		if (req.statusCode === 404) {
			return 'Resource not found';
		}
		return `${req.method} ${req.originalUrl} completed`;
	},
	customReceivedMessage: (req: { method?: string }, _res: unknown) => `Request received: ${req.method}`,
};

const logger: Logger = pino(baseOptions);
const httpLogger: HttpLogger = pinoHttp({ logger, ...httpOptions });

export interface LogOptions {
	scope: string;
	message: string;
	[key: string]: unknown;
}

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const log = (level: LogLevel, options: LogOptions): void => {
	const { message, ...rest } = options;
	logger[level]({ msg: message, ...rest });
};

/**
 * Shared application logger used by HTTP middleware and runtime code.
 * `scope` is the name of the function emitting the log.
 * In dev, pipe stdout through `pino-pretty` for readable output:
 *   `npm run start:dev:server`
 */
export const PinoLogger = {
	instance: httpLogger,

	fatal(options: LogOptions): void {
		log('fatal', options);
	},

	error(options: LogOptions): void {
		log('error', options);
	},

	warn(options: LogOptions): void {
		log('warn', options);
	},

	info(options: LogOptions): void {
		log('info', options);
	},

	debug(options: LogOptions): void {
		log('debug', options);
	},

	trace(options: LogOptions): void {
		log('trace', options);
	},
};
