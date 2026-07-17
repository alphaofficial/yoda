import { EntitySchema } from "@mikro-orm/postgresql";
import { Session } from "@/models/Session";

export const SessionMapper = new EntitySchema<Session>({
	class: Session,
	tableName: "sessions",
	properties: {
		id: { type: "string", primary: true },
		secret_hash: { type: "string" },
		user_id: { type: "string", nullable: true, index: true },
		ip_address: { type: "string", nullable: true, length: 45 },
		user_agent: { type: "string", nullable: true },
		payload: { type: "text" },
		last_activity: { type: "number", index: true },
		created_at: { type: "number" },
	},
});
