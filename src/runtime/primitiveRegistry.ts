const primitiveRegistry = new Map<string, unknown>();

/**
 * Register runtime state for a primitive.
 */
export function registerPrimitiveRuntime<T>(key: string, runtime: T): T {
	primitiveRegistry.set(key, runtime);
	return runtime;
}

/**
 * Read runtime state for a configured primitive.
 */
export function getPrimitiveRuntime<T>(key: string): T {
	const runtime = primitiveRegistry.get(key);
	if (!runtime) {
		throw new Error(`Primitive runtime "${key}" is not configured`);
	}
	return runtime as T;
}

/**
 * Check whether a primitive runtime has already been configured.
 */
export function hasPrimitiveRuntime(key: string): boolean {
	return primitiveRegistry.has(key);
}

/**
 * Clear one primitive runtime or the whole registry.
 */
export function clearPrimitiveRuntime(key?: string): void {
	if (key === undefined) {
		primitiveRegistry.clear();
		return;
	}

	primitiveRegistry.delete(key);
}
