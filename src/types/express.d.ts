import { User } from '@/models/User';
import { AppContext } from '@/runtime/context';
import '@inertiajs/core';
import 'express-session';

interface AppFlash {
	message?: string | null;
}

declare module '@inertiajs/core' {
	interface InertiaConfig {
		flashDataType: AppFlash;
	}
}

declare module 'express-session' {
	interface SessionData {
		flash?: AppFlash;
	}
}

declare module 'express-serve-static-core' {
	interface Request {
		ctx: AppContext;
		user(): Promise<User | null>;
		user_id(): User['id'] | null;
		is_authenticated(): boolean;
		is_guest(): boolean;
		authenticate(user: User): Promise<void>;
		logout(): Promise<void>;
	}
}
