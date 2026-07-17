import fs from 'fs/promises';
import path from 'path';
import type { StorageDriver } from '@/primitives/storage';

interface LocalDiskState {
	base: string;
	publicBaseUrl: string;
}

const resolvePath = (state: LocalDiskState, filePath: string): string => {
	const resolved = path.resolve(state.base, filePath);
	const relative = path.relative(state.base, resolved);

	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Invalid file path: "${filePath}" escapes the storage directory`);
	}

	return resolved;
};

/** Persist a file to local disk. */
const put = async (state: LocalDiskState, filePath: string, data: Buffer | string): Promise<void> => {
	const fullPath = resolvePath(state, filePath);
	await fs.mkdir(path.dirname(fullPath), { recursive: true });
	await fs.writeFile(fullPath, data);
};

/** Read a file from local disk. */
const get = (state: LocalDiskState, filePath: string): Promise<Buffer> => {
	return fs.readFile(resolvePath(state, filePath));
};

/** Delete a file from local disk. */
const deleteFile = async (state: LocalDiskState, filePath: string): Promise<void> => {
	await fs.unlink(resolvePath(state, filePath));
};

/** Build a public URL for a stored file. */
const url = (state: LocalDiskState, filePath: string): string => {
	return `${state.publicBaseUrl}/storage/${filePath}`;
};

/** Check whether a file exists on local disk. */
const exists = async (state: LocalDiskState, filePath: string): Promise<boolean> => {
	try {
		await fs.access(resolvePath(state, filePath));
		return true;
	} catch {
		return false;
	}
};

export function createLocalDiskDriver(basePath: string, baseUrl: string): StorageDriver {
	const state: LocalDiskState = {
		base: path.resolve(basePath),
		publicBaseUrl: baseUrl.replace(/\/$/, ''),
	};

	return {
		put: (filePath, data) => put(state, filePath, data),
		get: (filePath: string) => get(state, filePath),
		delete: (filePath: string) => deleteFile(state, filePath),
		url: (filePath: string) => url(state, filePath),
		exists: (filePath: string) => exists(state, filePath),
	};
}
