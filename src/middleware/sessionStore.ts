import { Store } from 'express-session';
import { MikroORM } from '@mikro-orm/core';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Session } from '@/models/Session';
import variables from '@/config/variables';

// 32-character alphabet (base32 without visually ambiguous characters).
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

// Generates a 24-char token segment (~120 bits entropy) using cryptographically
// secure randomness. Two segments combined give the full session token.
export function generateTokenSegment(): string {
  const bytes = randomBytes(24);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += TOKEN_ALPHABET[bytes[i] >> 3];
  }
  return out;
}

// Session token format is `<id>.<secret>`. The id is the public DB key;
// the secret is SHA-256 hashed and stored. A DB leak yields ids + hashes —
// insufficient to reconstruct live tokens.
export function generateSessionToken(): string {
  return `${generateTokenSegment()}.${generateTokenSegment()}`;
}

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function parseToken(token: string): { id: string; secret: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  return { id: token.slice(0, dot), secret: token.slice(dot + 1) };
}

function secretMatches(submitted: string, storedHex: string): boolean {
  const submittedHash = hashSecret(submitted);
  let storedBuf: Buffer;
  try {
    storedBuf = Buffer.from(storedHex, 'hex');
  } catch {
    return false;
  }
  if (storedBuf.length !== submittedHash.length) return false;
  return timingSafeEqual(submittedHash, storedBuf);
}

export class SessionStore extends Store {
  private orm: MikroORM;
  private requestStore = new Map<string, { ip?: string; userAgent?: string }>();

  constructor(orm: MikroORM) {
    super();
    this.orm = orm;
  }

  setRequestData(sessionId: string, ip: string, userAgent: string) {
    this.requestStore.set(sessionId, { ip, userAgent });
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const parsed = parseToken(sid);
      if (!parsed) return callback(null, null);

      const em = this.orm.em.fork();
      const session = await em.findOne(Session, { id: parsed.id });

      if (!session) return callback(null, null);

      if (!secretMatches(parsed.secret, session.secret_hash)) {
        return callback(null, null);
      }

      if (this.isExpired(session)) {
        await em.nativeDelete(Session, { id: parsed.id });
        return callback(null, null);
      }

      callback(null, JSON.parse(session.payload));
    } catch (error) {
      callback(error);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      const parsed = parseToken(sid);
      if (!parsed) throw new Error('Invalid session token format');

      const em = this.orm.em.fork();
      const payload = JSON.stringify(session);
      const now = Math.floor(Date.now() / 1000);
      const requestData = this.requestStore.get(sid);

      const existing = await em.findOne(Session, { id: parsed.id });

      if (existing) {
        if (!secretMatches(parsed.secret, existing.secret_hash)) {
          throw new Error('Session secret mismatch');
        }
        existing.payload = payload;
        existing.last_activity = now;
        existing.user_id = session.userId || undefined;
        await em.flush();
      } else {
        const record = em.create(Session, {
          id: parsed.id,
          secret_hash: hashSecret(parsed.secret).toString('hex'),
          payload,
          last_activity: now,
          created_at: now,
          user_id: session.userId || undefined,
          ip_address: requestData?.ip || undefined,
          user_agent: requestData?.userAgent || undefined,
        });
        await em.persistAndFlush(record);
      }

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      const parsed = parseToken(sid);
      if (!parsed) {
        this.requestStore.delete(sid);
        return callback?.();
      }
      const em = this.orm.em.fork();
      await em.nativeDelete(Session, { id: parsed.id });
      this.requestStore.delete(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  async touch(sid: string, _: any, callback?: (err?: any) => void) {
    try {
      const parsed = parseToken(sid);
      if (!parsed) return callback?.();

      const em = this.orm.em.fork();
      await em.nativeUpdate(
        Session,
        { id: parsed.id },
        { last_activity: Math.floor(Date.now() / 1000) }
      );
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  private isExpired(session: Session): boolean {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = Math.floor(variables.SESSION_MAX_AGE / 1000);
    return (now - session.last_activity) > maxAge;
  }
}
