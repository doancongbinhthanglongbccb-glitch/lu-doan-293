/**
 * Lightweight publish-subscribe event bus for cross-module communication.
 */
class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._handlers = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {Function} handler - Callback receiving payload
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        this._handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event
     * @param {Function} handler
     */
    off(event, handler) {
        const set = this._handlers.get(event);
        if (set) set.delete(handler);
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event
     * @param {*} [payload]
     */
    emit(event, payload) {
        const set = this._handlers.get(event);
        if (!set) return;
        set.forEach(handler => {
            try {
                handler(payload);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        });
    }

    /** Remove all handlers (useful for teardown). */
    clear() {
        this._handlers.clear();
    }
}

/** Singleton event bus instance */
export const eventBus = new EventBus();
