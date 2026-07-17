import type { BusDriver, BusListener } from '@/primitives/bus';

interface InMemoryBusState {
	listeners: Map<string, Set<BusListener>>;
}

/** Publish an event to all registered listeners. */
const publish = (state: InMemoryBusState, event: string, payload?: unknown): boolean => {
	const eventListeners = state.listeners.get(event);
	if (!eventListeners || eventListeners.size === 0) {
		return false;
	}

	for (const listener of eventListeners) {
		listener(payload);
	}

	return true;
};

/** Register a listener for an event. */
const on = (state: InMemoryBusState, event: string, listener: BusListener): void => {
	const eventListeners = state.listeners.get(event);
	if (eventListeners) {
		eventListeners.add(listener);
		return;
	}

	state.listeners.set(event, new Set([listener]));
};

export function createInMemoryBusDriver(): BusDriver {
	const state: InMemoryBusState = { listeners: new Map() };

	return {
		publish: (event, payload) => publish(state, event, payload),
		on: (event, listener) => on(state, event, listener),
	};
}
