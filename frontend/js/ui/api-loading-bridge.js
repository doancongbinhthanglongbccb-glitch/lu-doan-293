import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';
import { showLoading, hideLoading } from './loading.js';

let pendingRequests = 0;

/**
 * Bridge API request events to global loading overlay.
 */
export function initApiLoadingBridge() {
    eventBus.on(EVENTS.API_REQUEST_START, () => {
        pendingRequests++;
        if (pendingRequests === 1) showLoading('Đang kết nối server...');
    });
    eventBus.on(EVENTS.API_REQUEST_END, () => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        if (pendingRequests === 0) hideLoading();
    });
}
