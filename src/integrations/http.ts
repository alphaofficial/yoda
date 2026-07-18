import variables from '@/config/variables';

export class IntegrationRequestError extends Error {
	constructor(
		message: string,
		public readonly provider: string,
		public readonly status: number | null,
		public readonly retryAfterSeconds: number | null
	) {
		super(message);
		this.name = 'IntegrationRequestError';
	}
}

interface RequestOptions {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	provider: string;
	fetchImpl?: typeof fetch;
	sleeper?: (ms: number) => Promise<void>;
}

export async function requestJson<T>(options: RequestOptions): Promise<T> {
	const {
		url,
		method = 'GET',
		headers = {},
		body,
		provider,
		fetchImpl = fetch,
		sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	} = options;

	const timeoutMs = variables.DASHBOARD_REQUEST_TIMEOUT_MS;
	const retryCount = variables.DASHBOARD_RETRY_COUNT;

	const attempt = async (attemptNumber: number): Promise<T> => {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchImpl(url, {
				method,
				headers,
				body,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (response.status === 429) {
				const retryAfter = response.headers.get('Retry-After');
				const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
				if (retryAfterSeconds !== null && !Number.isNaN(retryAfterSeconds)) {
					const delay = Math.min(retryAfterSeconds * 1000, 5000);
					if (attemptNumber < retryCount) {
						await sleeper(delay);
						return attempt(attemptNumber + 1);
					}
					throw new IntegrationRequestError(
						'Rate limited',
						provider,
						429,
						retryAfterSeconds
					);
				}
				if (attemptNumber < retryCount) {
					const delays = [250, 750];
					const delayIndex = Math.min(attemptNumber - 1, delays.length - 1);
					await sleeper(delays[delayIndex]);
					return attempt(attemptNumber + 1);
				}
				throw new IntegrationRequestError(
					'Rate limited',
					provider,
					429,
					null
				);
			}

			if (response.status >= 500 && response.status <= 599) {
				if (attemptNumber <= retryCount) {
					const delays = [250, 750];
					const delayIndex = Math.min(attemptNumber - 1, delays.length - 1);
					await sleeper(delays[delayIndex]);
					return attempt(attemptNumber + 1);
				}
				throw new IntegrationRequestError(
					'Provider server error',
					provider,
					response.status,
					null
				);
			}

			if (response.status >= 400 && response.status < 500) {
				let errorBody = '';
				try {
					const text = await response.text();
					errorBody = text.slice(0, 200);
				} catch {
					// ignore read errors
				}
				throw new IntegrationRequestError(
					'Request failed',
					provider,
					response.status,
					null
				);
			}

			if (!response.ok) {
				throw new IntegrationRequestError(
					'Request failed',
					provider,
					response.status,
					null
				);
			}

			const text = await response.text();
			if (text === '') {
				return undefined as T;
			}
			return JSON.parse(text) as T;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof IntegrationRequestError) {
				throw error;
			}

			if (error instanceof Error && error.name === 'AbortError') {
				throw new IntegrationRequestError(
					'Request timed out',
					provider,
					null,
					null
				);
			}

			if (attemptNumber <= retryCount) {
				const delays = [250, 750];
				const delayIndex = Math.min(attemptNumber - 1, delays.length - 1);
				await sleeper(delays[delayIndex]);
				return attempt(attemptNumber + 1);
			}

			const message = error instanceof Error ? error.message : 'Network error';
			throw new IntegrationRequestError(
				message,
				provider,
				null,
				null
			);
		}
	};

	return attempt(1);
}
