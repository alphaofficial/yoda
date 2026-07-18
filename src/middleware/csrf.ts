import { Request, Response, NextFunction } from 'express';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Defense against cross-site request forgery via Origin-header verification.
//
// Rule: on a state-changing request, if `Origin` or `Referer` is present, it
// must match the host that received the request. Modern browsers send `Origin` for
// cross-origin requests, so a CSRF attempt is rejected. Same-origin requests
// from non-browser clients (curl, test runners) may omit both headers — allowed,
// since those are not browser-driven cross-site attacks.
export function verifyOrigin(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const origin = req.get('Origin') || req.get('Referer');
  if (!origin) return next();

  try {
    const host = new URL(origin).host;
    if (host !== req.get('host')) {
      return res.status(403).send('Forbidden');
    }
  } catch {
    return res.status(403).send('Forbidden');
  }

  next();
}
