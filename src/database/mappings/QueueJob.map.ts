import { EntitySchema } from "@mikro-orm/postgresql";
import { QueueJob } from "@/models/QueueJob";

export const QueueJobMapper = new EntitySchema<QueueJob>({
	class: QueueJob,
	tableName: "queue_jobs",
	properties: {
		id: { type: "string", primary: true },
		name: { type: "string" },
		payload: { type: "text" },
		status: { type: "string" },
		attempts: { type: "number", default: 0 },
		availableAt: { type: "number" },
		lockedAt: { type: "number", nullable: true },
		lockedBy: { type: "string", nullable: true },
		lastError: { type: "text", nullable: true },
		createdAt: { type: "number" },
		updatedAt: { type: "number" },
	},
	indexes: [
		{ name: "queue_jobs_pending_index", properties: ["status", "availableAt", "createdAt"] },
		{ name: "queue_jobs_locked_index", properties: ["status", "lockedAt"] },
	],
});
