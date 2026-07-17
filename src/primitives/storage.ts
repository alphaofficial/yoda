import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';

export interface StorageDriver {
	put(filePath: string, data: Buffer | string): Promise<void>;
	get(filePath: string): Promise<Buffer>;
	delete(filePath: string): Promise<void>;
	url(filePath: string): string;
	exists(filePath: string): Promise<boolean>;
}

interface StorageRuntime {
	driver: StorageDriver;
}

/** Configure the storage driver. */
const configure = (driver: StorageDriver): void => {
	if (hasPrimitiveRuntime('storage')) {
		return;
	}

	registerPrimitiveRuntime<StorageRuntime>('storage', {
		driver,
	});
};

/** Persist a file to storage. */
const put = (filePath: string, data: Buffer | string): Promise<void> => {
	return getPrimitiveRuntime<StorageRuntime>('storage').driver.put(filePath, data);
};

/** Read a file from storage. */
const get = (filePath: string): Promise<Buffer> => {
	return getPrimitiveRuntime<StorageRuntime>('storage').driver.get(filePath);
};

/** Delete a file from storage. */
const deleteFile = (filePath: string): Promise<void> => {
	return getPrimitiveRuntime<StorageRuntime>('storage').driver.delete(filePath);
};

/** Build a public URL for a stored file. */
const url = (filePath: string): string => {
	return getPrimitiveRuntime<StorageRuntime>('storage').driver.url(filePath);
};

/** Check whether a file exists in storage. */
const exists = (filePath: string): Promise<boolean> => {
	return getPrimitiveRuntime<StorageRuntime>('storage').driver.exists(filePath);
};

/**
 * Storage primitive for file persistence and URL generation.
 */
export const Storage = Object.freeze({
	configure,
	put,
	get,
	delete: deleteFile,
	url,
	exists,
});
