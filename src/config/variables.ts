const DEV_SESSION_SECRET = '0cfca1d1875a2b4d9742be6ae4603fd7bfac19012b03072649c352aaaa26e5c1';
const DEV_APP_KEY = 'dev_app_key_change_me_in_production_32chars!!';

function envValue(key: string, fallback?: string) {
	const value = process.env[key];
	return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function env(key: string, fallback?: string): string | undefined;
export function env(key: string, fallback: number): string | number;
export function env(key: string, fallback: boolean): string | boolean;
export function env(key: string, fallback?: string | number | boolean) {
	if (typeof fallback === 'number') {
		return env.int(key, fallback);
	}

	if (typeof fallback === 'boolean') {
		return env.bool(key, fallback);
	}

	return envValue(key, fallback);
}

env.int = (key: string, fallback: number) => {
	const raw = envValue(key);
	const value = raw ? Number(raw) : fallback;

	if (Number.isNaN(value)) {
		throw new Error(`${key} must be a number`);
	}

	return value;
};

env.bool = (key: string, fallback: boolean) => {
	const raw = envValue(key);

	if (raw == null || raw === '') {
		return fallback;
	}

	return raw === 'true' || raw === '1';
};

env.oneOf = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
	const value = (envValue(key, fallback) as T);

	if (!values.includes(value)) {
		throw new Error(`${key} must be one of: ${values.join(', ')}`);
	}

	return value;
};

const variables = {
	NODE_ENV: env.oneOf('NODE_ENV', ['development', 'production', 'test'] as const, 'development'),
	PORT: env.int('PORT', 3008),
	APP_NAME: env('APP_NAME', 'Yoda')!,
	APP_URL: env('APP_URL', 'http://localhost:3000')!,
	TRUST_PROXY: env('TRUST_PROXY', 'loopback')!,
	APP_KEY: env('APP_KEY'),
	SESSION_SECRET: env('SESSION_SECRET'),
	SESSION_MAX_AGE: env.int('SESSION_MAX_AGE', 24 * 60 * 60 * 1000),
	DB_PATH: env('DB_PATH', 'yoda.db')!,
	BACKUP_PATH: env('BACKUP_PATH', 'backups')!,
	RATE_LIMIT_ENABLED: env.bool('RATE_LIMIT_ENABLED', false),
	RATE_LIMIT_AUTH_MAX: env.int('RATE_LIMIT_AUTH_MAX', 5),
	RATE_LIMIT_AUTH_WINDOW_MS: env.int('RATE_LIMIT_AUTH_WINDOW_MS', 60_000),
	RATE_LIMIT_FEATURE_MAX: env.int('RATE_LIMIT_FEATURE_MAX', 60),
	RATE_LIMIT_FEATURE_WINDOW_MS: env.int('RATE_LIMIT_FEATURE_WINDOW_MS', 60_000),
	PASSWORD_RESET_EXPIRY: env.int('PASSWORD_RESET_EXPIRY', 60),
	EMAIL_VERIFICATION_EXPIRY: env.int('EMAIL_VERIFICATION_EXPIRY', 60),
	STORAGE_PATH: env('STORAGE_PATH', 'storage')!,
	MAIL_FROM: env('MAIL_FROM', 'noreply@example.com')!,
	MAIL_HOST: env('MAIL_HOST'),
	MAIL_PORT: env.int('MAIL_PORT', 587),
	MAIL_USER: env('MAIL_USER'),
	MAIL_PASS: env('MAIL_PASS'),
	DISABLE_SSR: env.bool('DISABLE_SSR', false),
	DASHBOARD_CONFIG_PATH: env('DASHBOARD_CONFIG_PATH', 'config/dashboard.json')!,
	DASHBOARD_CACHE_TTL_SECONDS: (() => {
		const raw = envValue('DASHBOARD_CACHE_TTL_SECONDS');
		const value = raw ? Number(raw) : 900;
		if (Number.isNaN(value) || !Number.isInteger(value) || value < 5 || value > 3600) {
			throw new Error('DASHBOARD_CACHE_TTL_SECONDS must be an integer from 5 to 3600');
		}
		return value;
	})(),
	GITHUB_REPOSITORY_CACHE_TTL_SECONDS: (() => {
		const raw = envValue('GITHUB_REPOSITORY_CACHE_TTL_SECONDS');
		const value = raw ? Number(raw) : 86_400;
		if (Number.isNaN(value) || !Number.isInteger(value) || value < 60 || value > 86400) {
			throw new Error('GITHUB_REPOSITORY_CACHE_TTL_SECONDS must be an integer from 60 to 86400');
		}
		return value;
	})(),
	DASHBOARD_REQUEST_TIMEOUT_MS: (() => {
		const raw = envValue('DASHBOARD_REQUEST_TIMEOUT_MS');
		const value = raw ? Number(raw) : 5000;
		if (Number.isNaN(value) || !Number.isInteger(value) || value < 1000 || value > 30000) {
			throw new Error('DASHBOARD_REQUEST_TIMEOUT_MS must be an integer from 1000 to 30000');
		}
		return value;
	})(),
	DASHBOARD_RETRY_COUNT: (() => {
		const raw = envValue('DASHBOARD_RETRY_COUNT');
		const value = raw ? Number(raw) : 2;
		if (Number.isNaN(value) || !Number.isInteger(value) || value < 0 || value > 4) {
			throw new Error('DASHBOARD_RETRY_COUNT must be an integer from 0 to 4');
		}
		return value;
	})(),
};

if (!variables.SESSION_SECRET) {
	if (variables.NODE_ENV === 'production') {
		throw new Error(
			'SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32',
		);
	}

	variables.SESSION_SECRET = DEV_SESSION_SECRET;
}

if (!variables.APP_KEY) {
	if (variables.NODE_ENV === 'production') {
		throw new Error(
			'APP_KEY is required in production. Generate one with: openssl rand -hex 32',
		);
	}

	variables.APP_KEY = DEV_APP_KEY;
}

export default variables as typeof variables & {
	SESSION_SECRET: string;
	APP_KEY: string;
};
