import { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const noop: RequestHandler = (_req, _res, next) => next();

function bool(v: string | undefined): boolean {
return v === 'true' || v === '1';
}

/**
 * Rate limiter for sensitive auth endpoints (/login, /register).
 *
 * Uses ipKeyGenerator from express-rate-limit v8 to handle IPv6 addresses.
 * Disabled by default. Enable with RATE_LIMIT_ENABLED=true.
 *
 *   RATE_LIMIT_AUTH_MAX (default 5)
 *   RATE_LIMIT_AUTH_WINDOW_MS (default 60000)
 *
 * Reads env at the moment the middleware is created (typically app boot).
 */
export function authRateLimit(): RequestHandler {
if (!bool(process.env.RATE_LIMIT_ENABLED)) return noop;

const max = Number(process.env.RATE_LIMIT_AUTH_MAX ?? 5);
const windowMs = Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 60_000);

return rateLimit({
windowMs,
max,
standardHeaders: true,
legacyHeaders: false,
keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
message: { error: 'Too many requests, please try again later.' },
});
}

/**
 * Rate limiter for authenticated feature endpoints.
 *
 * Keys by session userId so IPv6 is not involved. Falls back to IP via
 * ipKeyGenerator for unauthenticated requests that somehow reach a guarded route.
 * Disabled by default. Enable with RATE_LIMIT_ENABLED=true.
 *
 *   RATE_LIMIT_FEATURE_MAX (default 60)
 *   RATE_LIMIT_FEATURE_WINDOW_MS (default 60000)
 */
export function featureRateLimit(): RequestHandler {
if (!bool(process.env.RATE_LIMIT_ENABLED)) return noop;

const max = Number(process.env.RATE_LIMIT_FEATURE_MAX ?? 60);
const windowMs = Number(process.env.RATE_LIMIT_FEATURE_WINDOW_MS ?? 60_000);

return rateLimit({
windowMs,
max,
standardHeaders: true,
legacyHeaders: false,
keyGenerator: (req) => {
const userId = (req.session as any)?.userId;
return userId ? String(userId) : ipKeyGenerator(req.ip ?? '');
},
message: { error: 'Too many requests, please try again later.' },
});
}
