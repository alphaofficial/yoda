import variables from '@/config/variables';

export class IntegrationRequestError extends Error {
	constructor(
		message: string,
		public readonly provider: string,
		public readonly status: number | null,
		public readonly retryAfterSeconds: number | null,
	) {
		super(message);
		this.name = 'IntegrationRequestError';
	}
}

export interface HttpOptions {
	headers?: Record<string, string>;
}

export interface HttpPostOptions extends HttpOptions {
	body?: string;
}

export interface HttpClient {
	get<T>(path: string, options?: HttpOptions): Promise<T>;
	post<T>(path: string, options?: HttpPostOptions): Promise<T>;
}

export function createHttpClient(baseUrl: string): HttpClient {
	const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
	const provider = new URL(normalizedBaseUrl).hostname;
	const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

	async function execute<T>(
		path: string,
		method: 'GET' | 'POST',
		{ headers = {}, body }: HttpPostOptions = {},
	): Promise<T> {
		const url = new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
		const timeoutMs = variables.DASHBOARD_REQUEST_TIMEOUT_MS;
		const retryCount = variables.DASHBOARD_RETRY_COUNT;

		const attempt = async (attemptNumber: number): Promise<T> => {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

			try {
				const response = await fetch(url, {
					method,
					headers,
					body,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (response.status === 429) {
					const retryAfter = response.headers.get('Retry-After');
					const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
					const delay = retryAfterSeconds !== null && !Number.isNaN(retryAfterSeconds)
						? Math.min(retryAfterSeconds * 1000, 5000)
						: [250, 750][Math.min(attemptNumber - 1, 1)];

					if (attemptNumber < retryCount) {
						await sleep(delay);
						return attempt(attemptNumber + 1);
					}

					throw new IntegrationRequestError('Rate limited', provider, 429, retryAfterSeconds);
				}

				if (response.status >= 500 && response.status <= 599) {
					if (attemptNumber <= retryCount) {
						const delays = [250, 750];
						const delayIndex = Math.min(attemptNumber - 1, delays.length - 1);
						await sleep(delays[delayIndex]);
						return attempt(attemptNumber + 1);
					}
					throw new IntegrationRequestError('Provider server error', provider, response.status, null);
				}

				if (response.status >= 400 && response.status < 500) {
					try {
						await response.text();
					} catch {
						// The status code remains the useful failure detail.
					}
					throw new IntegrationRequestError('Request failed', provider, response.status, null);
				}

				if (!response.ok) {
					throw new IntegrationRequestError('Request failed', provider, response.status, null);
				}

				const text = await response.text();
				return text === '' ? undefined as T : JSON.parse(text) as T;
			} catch (error) {
				clearTimeout(timeoutId);

				if (error instanceof IntegrationRequestError) {
					throw error;
				}

				if (error instanceof Error && error.name === 'AbortError') {
					throw new IntegrationRequestError('Request timed out', provider, null, null);
				}

				if (attemptNumber <= retryCount) {
					const delays = [250, 750];
					const delayIndex = Math.min(attemptNumber - 1, delays.length - 1);
					await sleep(delays[delayIndex]);
					return attempt(attemptNumber + 1);
				}

				const message = error instanceof Error ? error.message : 'Network error';
				throw new IntegrationRequestError(message, provider, null, null);
			}
		};

		return attempt(1);
	}

	return {
		get: (url, requestOptions) => execute(url, 'GET', requestOptions),
		post: (url, requestOptions) => execute(url, 'POST', requestOptions),
	};
}
