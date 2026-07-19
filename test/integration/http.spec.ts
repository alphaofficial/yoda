import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, IntegrationRequestError } from '@/integrations/http';

function response(status: number, body = '', headers: Record<string, string> = {}): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name: string) => headers[name] ?? null },
		text: async () => body,
	} as unknown as Response;
}

describe('HttpClient', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function settle<T>(promise: Promise<T>): Promise<T> {
		const result = promise.then(
			value => ({ value, error: null as unknown }),
			error => ({ value: undefined as T | undefined, error }),
		);
		await vi.runAllTimersAsync();
		const settled = await result;
		if (settled.error) throw settled.error;
		return settled.value as T;
	}

	it('resolves relative paths against the configured base URL', async () => {
		mockFetch.mockResolvedValue(response(200, JSON.stringify({ ok: true })));
		const client = createHttpClient('https://api.example.com');

		const result = await settle(client.post<{ ok: boolean }>('/items', {
			headers: { Authorization: 'Bearer token' },
			body: JSON.stringify({ name: 'item' }),
		}));

		expect(result).toEqual({ ok: true });
		expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items', expect.objectContaining({
			method: 'POST',
			headers: { Authorization: 'Bearer token' },
			body: JSON.stringify({ name: 'item' }),
		}));
	});

	it('returns undefined for an empty successful response', async () => {
		mockFetch.mockResolvedValue(response(204));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/empty'))).resolves.toBeUndefined();
	});

	it('retries transient network failures with bounded backoff', async () => {
		const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
		mockFetch
			.mockRejectedValueOnce(new Error('network'))
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce(response(200, JSON.stringify({ ok: true })));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/items'))).resolves.toEqual({ ok: true });
		expect(mockFetch).toHaveBeenCalledTimes(3);
		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);
		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 750);
	});

	it('retries server failures only up to the configured limit', async () => {
		mockFetch.mockResolvedValue(response(500, 'failure'));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/items'))).rejects.toBeInstanceOf(IntegrationRequestError);
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it('honours Retry-After while capping its delay', async () => {
		const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
		mockFetch
			.mockResolvedValueOnce(response(429, 'rate limited', { 'Retry-After': '30' }))
			.mockResolvedValueOnce(response(200, JSON.stringify({ ok: true })));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/items'))).resolves.toEqual({ ok: true });
		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
	});

	it('does not retry non-transient client errors', async () => {
		mockFetch.mockResolvedValue(response(401, 'Bearer secret-token'));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/items', {
			headers: { Authorization: 'Bearer secret-token' },
		}))).rejects.toMatchObject({
			name: 'IntegrationRequestError',
			message: 'Request failed',
			provider: 'api.example.com',
			status: 401,
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('reports aborts as timeouts without retrying', async () => {
		mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
		const client = createHttpClient('https://api.example.com');

		await expect(settle(client.get('/slow'))).rejects.toMatchObject({
			message: 'Request timed out',
			provider: 'api.example.com',
			status: null,
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
