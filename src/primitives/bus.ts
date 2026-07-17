import { AppContext } from '@/runtime/context';
import { loadRelativeDirectory } from '@/runtime/loadRelativeDirectory';
import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';

export type BusListener = (payload: unknown) => void;

interface BusRuntime {
	driver: BusDriver;
	ctx: AppContext;
	started: boolean;
}

export interface BusDriver {
	publish(event: string, payload?: unknown): boolean;
	on(event: string, listener: BusListener): void;
	start?(): void | Promise<void>;
}

/** Configure the bus driver. */
const configure = (driver: BusDriver, ctx: AppContext): void => {
	if (hasPrimitiveRuntime('bus')) {
		return;
	}

	registerPrimitiveRuntime<BusRuntime>('bus', {
		driver,
		ctx,
		started: false,
	});
};

/** Load event listeners and start the bus driver once. */
const start = (): void => {
	const busRuntime = getPrimitiveRuntime<BusRuntime>('bus');
	if (busRuntime.started) {
		return;
	}

	loadRelativeDirectory('events');
	busRuntime.started = true;
	void busRuntime.driver.start?.();
};

/** Publish an event to registered listeners. */
const publish = (event: string, payload?: unknown): boolean => {
	return getPrimitiveRuntime<BusRuntime>('bus').driver.publish(event, payload);
};

/** Register a listener for an event. */
const on = <T = unknown>(event: string, listener: (ctx: AppContext, payload: T) => void): void => {
	const runtime = getPrimitiveRuntime<BusRuntime>('bus');

	runtime.driver.on(event, payload => {
		listener(runtime.ctx, payload as T);
	});
};

/**
 * Process-local event bus for modular-monolith communication.
 */
export const Bus = Object.freeze({
	configure,
	start,
	publish,
	on,
});
