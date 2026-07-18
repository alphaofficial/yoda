import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpClient, IntegrationRequestError } from '@/integrations/http';

describe('HttpClient', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let createMockFetch: any;

	function send<T>(options: {
		url: string;
		method?: 'GET' | 'POST';
		headers?: Record<string, string>;
		body?: string;
		provider: string;
		sleeper?: (milliseconds: number) => Promise<void>;
	}): Promise<T> {
		const { url, method = 'GET', sleeper, ...requestOptions } = options;
		const client = createHttpClient({ transport: createMockFetch, sleep: sleeper });
		return method === 'POST'
			? client.post<T>(url, requestOptions)
			: client.get<T>(url, requestOptions);
	}

	beforeEach(() => {
		createMockFetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createMockResponse(options: {
		status?: number;
		ok?: boolean;
		headers?: Record<string, string>;
		body?: string;
	}): Response {
		const { status = 200, ok = true, headers = {}, body = '' } = options;
		return {
			ok,
			status,
			headers: {
				get: (name: string) => headers[name] ?? null,
			},
			text: async () => body,
		} as unknown as Response;
	}

	describe('HTTP success, timeout, and JSON parsing', () => {
		it('parses JSON response successfully', async () => {
			const mockData = { foo: 'bar', count: 42 };
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify(mockData),
				})
			);

			const result = await send({
				url: 'https://api.example.com/data',
				provider: 'test',
			});

			expect(result).toEqual(mockData);
		});

		it('returns undefined for empty response body', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 204,
					body: '',
				})
			);

			const result = await send({
				url: 'https://api.example.com/empty',
				provider: 'test',
			});

			expect(result).toBeUndefined();
		});

		it('uses AbortSignal.timeout for request timeout', async () => {
			const timeoutError = Object.assign(new Error('Aborted due to timeout'), {
				name: 'AbortError',
			});

			createMockFetch.mockRejectedValueOnce(timeoutError);

			await expect(
				send({
					url: 'https://api.example.com/slow',
					provider: 'test',
					sleeper: async () => {},
				})
			).rejects.toMatchObject({
				message: 'Request timed out',
				provider: 'test',
				status: null,
				retryAfterSeconds: null,
			});
		});

		it('uses configured method and headers', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: '{"ok": true}',
				})
			);

			await send({
				url: 'https://api.example.com/data',
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
				body: '{"test": true}',
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledWith(
				'https://api.example.com/data',
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
					body: '{"test": true}',
				})
			);
		});
	});

	describe('bounded retry matrix and capped Retry-After', () => {
		it('retries on network error with exponential backoff', async () => {
			const networkError = new Error('Network connection failed');
			createMockFetch
				.mockRejectedValueOnce(networkError)
				.mockRejectedValueOnce(networkError)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 200,
						body: '{"success": true}',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			const result = await send({
				url: 'https://api.example.com/data',
				provider: 'test',
				sleeper,
			});

			expect(result).toEqual({ success: true });
			expect(createMockFetch).toHaveBeenCalledTimes(3);
			expect(sleeper).toHaveBeenCalledTimes(2);
			expect(sleeper).toHaveBeenNthCalledWith(1, 250);
			expect(sleeper).toHaveBeenNthCalledWith(2, 750);
		});

		it('retries on HTTP 429 with Retry-After header', async () => {
			createMockFetch
				.mockResolvedValueOnce(
					createMockResponse({
						status: 429,
						ok: false,
						headers: { 'Retry-After': '3' },
						body: 'Rate limited',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 200,
						body: '{"success": true}',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			const result = await send({
				url: 'https://api.example.com/data',
				provider: 'test',
				sleeper,
			});

			expect(result).toEqual({ success: true });
			expect(sleeper).toHaveBeenCalledWith(3000);
		});

		it('caps Retry-After delay at 5000ms', async () => {
			createMockFetch
				.mockResolvedValueOnce(
					createMockResponse({
						status: 429,
						ok: false,
						headers: { 'Retry-After': '10' },
						body: 'Rate limited',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 200,
						body: '{"success": true}',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await send({
				url: 'https://api.example.com/data',
				provider: 'test',
				sleeper,
			});

			expect(sleeper).toHaveBeenCalledWith(5000);
		});

		it('retries on HTTP 500-599 server errors', async () => {
			createMockFetch
				.mockResolvedValueOnce(
					createMockResponse({
						status: 500,
						ok: false,
						body: 'Internal Server Error',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 502,
						ok: false,
						body: 'Bad Gateway',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 200,
						body: '{"success": true}',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			const result = await send({
				url: 'https://api.example.com/data',
				provider: 'test',
				sleeper,
			});

			expect(result).toEqual({ success: true });
			expect(sleeper).toHaveBeenCalledTimes(2);
			expect(sleeper).toHaveBeenNthCalledWith(1, 250);
			expect(sleeper).toHaveBeenNthCalledWith(2, 750);
		});

		it('does not retry beyond retry count', async () => {
			createMockFetch.mockResolvedValue(
				createMockResponse({
					status: 500,
					ok: false,
					body: 'Server Error',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toThrow(IntegrationRequestError);

			expect(createMockFetch).toHaveBeenCalledTimes(3);
			expect(sleeper).toHaveBeenCalledTimes(2);
		});

		it('uses default retry delays (250ms, 750ms)', async () => {
			const networkError = new Error('Network error');
			createMockFetch
				.mockRejectedValueOnce(networkError)
				.mockRejectedValueOnce(networkError)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 200,
						body: '{"ok": true}',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await send({
				url: 'https://api.example.com/data',
				provider: 'test',
				sleeper,
			});

			expect(sleeper).toHaveBeenNthCalledWith(1, 250);
			expect(sleeper).toHaveBeenNthCalledWith(2, 750);
		});
	});

	describe('no retry for non-transient 4xx', () => {
		it('does not retry HTTP 400', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 400,
					ok: false,
					body: 'Bad Request',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 400,
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledTimes(1);
			expect(sleeper).not.toHaveBeenCalled();
		});

		it('does not retry HTTP 401', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 401,
					ok: false,
					body: 'Unauthorized',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 401,
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledTimes(1);
			expect(sleeper).not.toHaveBeenCalled();
		});

		it('does not retry HTTP 403', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 403,
					ok: false,
					body: 'Forbidden',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 403,
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledTimes(1);
			expect(sleeper).not.toHaveBeenCalled();
		});

		it('does not retry HTTP 404', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 404,
					ok: false,
					body: 'Not Found',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 404,
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledTimes(1);
			expect(sleeper).not.toHaveBeenCalled();
		});

		it('does not retry HTTP 422', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 422,
					ok: false,
					body: 'Validation Error',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 422,
				provider: 'test',
			});

			expect(createMockFetch).toHaveBeenCalledTimes(1);
			expect(sleeper).not.toHaveBeenCalled();
		});
	});

	describe('sanitized errors', () => {
		it('exposes safe message without leaking authorization', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 401,
					ok: false,
					body: 'Bearer secret-token-abc123',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				message: 'Request failed',
				provider: 'test',
				status: 401,
			});
		});

		it('caps error body in internal log at 200 characters', async () => {
			const longErrorBody = 'x'.repeat(500);

			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 400,
					ok: false,
					body: longErrorBody,
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				message: 'Request failed',
				provider: 'test',
				status: 400,
			});
		});

		it('does not include authorization header in thrown error', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 403,
					ok: false,
					body: 'Forbidden',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					headers: { Authorization: 'Bearer secret-value' },
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				message: 'Request failed',
				provider: 'test',
			});
		});

		it('does not include request body in error', async () => {
			createMockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 400,
					ok: false,
					body: 'Bad Request',
				})
			);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					method: 'POST',
					body: JSON.stringify({ secret: 'sensitive-data' }),
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				message: 'Request failed',
				provider: 'test',
			});
		});

		it('returns IntegrationRequestError with correct properties', async () => {
			createMockFetch
				.mockResolvedValueOnce(
					createMockResponse({
						status: 500,
						ok: false,
						body: 'Internal Server Error',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 500,
						ok: false,
						body: 'Internal Server Error',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 500,
						ok: false,
						body: 'Internal Server Error',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'github',
					sleeper,
				})
			).rejects.toMatchObject({
				name: 'IntegrationRequestError',
				provider: 'github',
				status: 500,
				retryAfterSeconds: null,
			});
		});

		it('includes retry-after seconds in error for 429 without retry', async () => {
			createMockFetch
				.mockResolvedValueOnce(
					createMockResponse({
						status: 429,
						ok: false,
						headers: { 'Retry-After': '30' },
						body: 'Rate limited',
					})
				)
				.mockResolvedValueOnce(
					createMockResponse({
						status: 429,
						ok: false,
						headers: { 'Retry-After': '30' },
						body: 'Rate limited',
					})
				);

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				status: 429,
				retryAfterSeconds: 30,
			});

			expect(createMockFetch).toHaveBeenCalledTimes(2);
			expect(sleeper).toHaveBeenCalledWith(5000);
		});

		it('handles network errors with safe message', async () => {
			createMockFetch.mockRejectedValue(new Error('ENOTFOUND'));

			const sleeper = vi.fn().mockResolvedValue(undefined);

			await expect(
				send({
					url: 'https://api.example.com/data',
					provider: 'test',
					sleeper,
				})
			).rejects.toMatchObject({
				message: 'ENOTFOUND',
				provider: 'test',
				status: null,
			});
		});
	});
});
