import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { verifyOrigin } from '@/middleware/csrf';

function createTestApp() {
	const app = express();
	app.use(verifyOrigin);
	app.patch('/settings', (_req, res) => res.sendStatus(204));
	return app;
}

describe('origin verification', () => {
	it('accepts localhost when localhost served the page', async () => {
		const response = await request(createTestApp())
			.patch('/settings')
			.set('Host', 'localhost:3333')
			.set('Origin', 'http://localhost:3333');

		expect(response.status).toBe(204);
	});

	it('accepts 127.0.0.1 when 127.0.0.1 served the page', async () => {
		const response = await request(createTestApp())
			.patch('/settings')
			.set('Host', '127.0.0.1:3333')
			.set('Origin', 'http://127.0.0.1:3333');

		expect(response.status).toBe(204);
	});

	it('rejects a different origin', async () => {
		const response = await request(createTestApp())
			.patch('/settings')
			.set('Host', 'localhost:3333')
			.set('Origin', 'https://attacker.example');

		expect(response.status).toBe(403);
	});
});
