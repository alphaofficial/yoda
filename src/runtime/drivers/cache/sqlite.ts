import type { EntityManager } from '@mikro-orm/core';
import { CacheEntry } from '@/models/CacheEntry';
import type { CacheDriver } from '@/primitives/cache';

function serialize(value: unknown): string {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) throw new TypeError('SQLite cache values must be JSON serializable');
	return serialized;
}

export function createSqliteCacheDriver(db: EntityManager): CacheDriver {
	return {
		async get<T>(key: string): Promise<T | undefined> {
			const cacheDb = db.fork();
			const entry = await cacheDb.findOne(CacheEntry, { key });
			if (!entry) return undefined;

			if (entry.expiresAt !== null && entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
				await cacheDb.nativeDelete(CacheEntry, { key });
				return undefined;
			}

			try {
				return JSON.parse(entry.value) as T;
			} catch {
				await cacheDb.nativeDelete(CacheEntry, { key });
				return undefined;
			}
		},

		async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
			const cacheDb = db.fork();
			await cacheDb.upsert(CacheEntry, {
				key,
				value: serialize(value),
				expiresAt: ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null,
			});
		},

		async delete(key: string): Promise<void> {
			await db.fork().nativeDelete(CacheEntry, { key });
		},

		async flush(): Promise<void> {
			await db.fork().nativeDelete(CacheEntry, {});
		},
	};
}
