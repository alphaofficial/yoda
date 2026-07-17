import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';

export interface CacheDriver {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
	delete(key: string): Promise<void>;
	flush(): Promise<void>;
}

interface CacheRuntime {
	driver: CacheDriver;
}

/** Configure the cache driver. */
const configure = (driver: CacheDriver): void => {
	if (hasPrimitiveRuntime('cache')) {
		return;
	}

	registerPrimitiveRuntime<CacheRuntime>('cache', {
		driver,
	});
};

/** Read a value from cache. */
const get = <T = unknown>(key: string): Promise<T | undefined> => {
	return getPrimitiveRuntime<CacheRuntime>('cache').driver.get<T>(key);
};

/** Write a value to cache. */
const set = (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
	return getPrimitiveRuntime<CacheRuntime>('cache').driver.set(key, value, ttlSeconds);
};

/** Delete a value from cache. */
const deleteKey = (key: string): Promise<void> => {
	return getPrimitiveRuntime<CacheRuntime>('cache').driver.delete(key);
};

/** Remove all values from cache. */
const flush = (): Promise<void> => {
	return getPrimitiveRuntime<CacheRuntime>('cache').driver.flush();
};

/**
 * Cache primitive for reading and writing transient values.
 */
export const Cache = Object.freeze({
	configure,
	get,
	set,
	delete: deleteKey,
	flush,
});
