import "dotenv-defaults/config";
import type { Options } from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { env } from "@/config/variables";

const mikroOrmOptions: Options = {
	entities: ["dist/database/mappings/*.map.js"],
	entitiesTs: ["src/database/mappings/*.map.ts"],
	dbName: env("DB_PATH") as string,
	driver: SqliteDriver,
	pool: {
		// this will setup wal mode for sqlite
		// see https://www.sqlite.org/wal.html for more details
		// this will introduce two additional files alongside your main .db file:å
		// WAL (Write-Ahead Log):
		// - Stores all database changes before they're written to the main .db file
		// - New writes go to the WAL file first, then get "checkpointed" to the main database later
		// - Enables concurrent reads while writes are happening

		// SHM (Shared Memory):
		// - Index file that tracks which pages in the WAL file are valid
		// - Helps coordinate between multiple database connections
		// - Used for WAL file management and reader/writer coordination
		afterCreate: (conn: any, done: any) => {
			conn.exec('PRAGMA journal_mode=WAL;');
			conn.exec('PRAGMA synchronous=NORMAL;');
			conn.exec('PRAGMA busy_timeout=5000;');
			done(null, conn);
		}
	},
	migrations: {
		path: "dist/database/migrations",
		pathTs: "src/database/migrations",
	},
	resultCache: {
		global: 0,
	},
	extensions: [Migrator],
	allowGlobalContext: process.env.NODE_ENV === "test",
	seeder: {
		path: "dist/database/seeder",
		pathTs: "src/database/seeder",
		defaultSeeder: "DatabaseSeeder",
		emit: "ts",
	},
};

export default {
	...mikroOrmOptions,
};
