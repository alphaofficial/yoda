import 'dotenv-defaults/config';
import { MikroORM } from '@mikro-orm/core';
import ormConfig from '@/database/orm.config';
import { DashboardConfigRepository } from '@/repositories/DashboardConfigRepository';

async function main() {
	const orm = await MikroORM.init(ormConfig);
	try {
		const db = orm.em.fork();
		const seeded = await new DashboardConfigRepository(db).seedFromJsonIfEmpty();
		console.log(seeded ? 'Dashboard database seeded from config/dashboard.json' : 'Dashboard database already initialized');
	} finally {
		await orm.close(true);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
