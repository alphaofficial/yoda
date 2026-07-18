import { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import { User } from "@/models/User";
import { hash } from "@/utilities/hash";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin-password";

export class DatabaseSeeder extends Seeder {
	async run(db: EntityManager): Promise<void> {
		const existingAdmin = await db.findOne(User, { email: ADMIN_EMAIL });

		if (existingAdmin) {
			return;
		}

		const admin = new User(
			"00000000-0000-4000-8000-000000000001",
			"Admin User",
			ADMIN_EMAIL,
			await hash.make(ADMIN_PASSWORD)
		);
		admin.emailVerifiedAt = new Date();

		await db.persist(admin).flush();
	}
}
