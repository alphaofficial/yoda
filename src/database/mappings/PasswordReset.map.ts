import { EntitySchema } from "@mikro-orm/postgresql";
import { PasswordReset } from "@/models/PasswordReset";

export const PasswordResetMapper = new EntitySchema<PasswordReset>({
	class: PasswordReset,
	tableName: "password_resets",
	properties: {
		email: { type: "string", primary: true },
		tokenHash: { type: "string" },
		createdAt: {
			type: "Date",
			defaultRaw: "CURRENT_TIMESTAMP",
		},
	},
});
