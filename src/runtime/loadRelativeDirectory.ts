import fs from 'fs';
import path from 'path';

const loadedDirectories = new Set<string>();
const extension = path.extname(__filename);

function load(directory: string): void {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const filePath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			load(filePath);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (!entry.name.endsWith(extension)) {
			continue;
		}

		require(filePath);
	}
}

export function loadRelativeDirectory(name: string): void {
	if (loadedDirectories.has(name)) {
		return;
	}

	const directory = path.join(__dirname, '..', name);
	if (!fs.existsSync(directory)) {
		loadedDirectories.add(name);
		return;
	}

	load(directory);
	loadedDirectories.add(name);
}
