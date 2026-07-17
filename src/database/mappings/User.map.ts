import { EntitySchema } from "@mikro-orm/postgresql";
import { User } from "@/models/User";

export const UserMapper = new EntitySchema<User>({
	class: User,
	tableName: "users",
	properties: {
		id: { type: "string", primary: true },
		name: { type: "string" },
		email: { type: "string", unique: true },
		password: { type: "string" },
		emailVerifiedAt: { type: "Date", nullable: true },
		rememberToken: { type: "string", nullable: true },
		createdAt: {
			type: "Date",
			defaultRaw: "CURRENT_TIMESTAMP",
		},
		updatedAt: {
			type: "Date",
			defaultRaw: "CURRENT_TIMESTAMP",
			onUpdate: () => new Date(),
		},
	},
});