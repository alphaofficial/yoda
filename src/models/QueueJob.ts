export class QueueJob {
	id: string;
	name: string;
	payload: string;
	status: string = 'pending';
	attempts: number = 0;
	availableAt: number;
	lockedAt?: number | null;
	lockedBy?: string | null;
	lastError?: string | null;
	createdAt: number;
	updatedAt: number;

	constructor(id: string, name: string, payload: string, now: number) {
		this.id = id;
		this.name = name;
		this.payload = payload;
		this.availableAt = now;
		this.createdAt = now;
		this.updatedAt = now;
	}
}
