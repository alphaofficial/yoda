import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { CacheEntryMapper } from '@/database/mappings/CacheEntry.map';
import { CacheEntry } from '@/models/CacheEntry';
import { createSqliteCacheDriver } from '@/runtime/drivers/cache/sqlite';

describe('SQLite cache driver', () => {
	let orm: MikroORM;

	beforeEach(async () => {
		orm = await MikroORM.init({
			entities: [CacheEntryMapper],
			dbName: ':memory:',
			driver: SqliteDriver,
		});
		await orm.schema.createSchema();
	});

	afterEach(async () => {
		vi.useRealTimers();
		await orm.close(true);
	});

	it('persists values across driver instances', async () => {
		const first = createSqliteCacheDriver(orm.em);
		await first.set('dashboard', { items: ['pr-1'] }, 60);

		const second = createSqliteCacheDriver(orm.em);
		await expect(second.get('dashboard')).resolves.toEqual({ items: ['pr-1'] });
	});

	it('removes expired values', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
		const cache = createSqliteCacheDriver(orm.em);
		await cache.set('temporary', 'value', 1);

		vi.advanceTimersByTime(1_001);

		await expect(cache.get('temporary')).resolves.toBeUndefined();
		await expect(orm.em.fork().count(CacheEntry, {})).resolves.toBe(0);
	});

	it('deletes individual values and flushes all values', async () => {
		const cache = createSqliteCacheDriver(orm.em);
		await cache.set('first', 1);
		await cache.set('second', 2);
		await cache.delete('first');

		await expect(cache.get('first')).resolves.toBeUndefined();
		await expect(cache.get('second')).resolves.toBe(2);

		await cache.flush();
		await expect(cache.get('second')).resolves.toBeUndefined();
	});
});
