import type { CacheDriver } from '@/primitives/cache';

interface CacheEntry {
	value: unknown;
	expiresAt: number | null;
}

interface MemoryCacheState {
	store: Map<string, CacheEntry>;
}

/** Read a value from cache, returning undefined if missing or expired. */
const get = async <T = unknown>(state: MemoryCacheState, key: string): Promise<T | undefined> => {
	const entry = state.store.get(key);
	if (!entry) {
		return undefined;
	}

	if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
		state.store.delete(key);
		return undefined;
	}

	return entry.value as T;
};

/** Write a value to cache with an optional TTL in seconds. */
const set = async (state: MemoryCacheState, key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
	state.store.set(key, {
		value,
		expiresAt: ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null,
	});
};

/** Delete a value from cache. */
const deleteKey = async (state: MemoryCacheState, key: string): Promise<void> => {
	state.store.delete(key);
};

/** Remove all values from cache. */
const flush = async (state: MemoryCacheState): Promise<void> => {
	state.store.clear();
};

export function createMemoryCacheDriver(): CacheDriver {
	const state: MemoryCacheState = { store: new Map() };

	return {
		get: <T>(key: string) => get<T>(state, key),
		set: (key, value, ttlSeconds) => set(state, key, value, ttlSeconds),
		delete: (key: string) => deleteKey(state, key),
		flush: () => flush(state),
	};
}
