import { eventBus } from '../../core/event-bus.js';
import { EVENTS, ROUTES } from '../../config/index.js';

/**
 * Redirect to login when session is invalidated (401/403).
 */
export function initAuthSessionBridge() {
    eventBus.on(EVENTS.AUTH_LOGOUT, () => {
        const path = window.location.pathname;
        if (path === ROUTES.LOGIN || path === ROUTES.REGISTER) return;
        window.location.href = ROUTES.LOGIN;
    });
}
