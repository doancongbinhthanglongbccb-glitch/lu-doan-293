import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';
import { $, createElement } from '../utils/dom.js';

/** @type {HTMLElement|null} */
let container = null;

/**
 * Initialize toast container in DOM.
 */
export function initToast() {
    if ($('toastContainer')) return;
    container = createElement('div', { className: 'toast-container', attrs: { id: 'toastContainer' } });
    document.body.appendChild(container);
    eventBus.on(EVENTS.UI_TOAST, show);
}

/**
 * Show a toast notification.
 * @param {string|{ message: string, type?: string, duration?: number }} input
 * @param {string} [type='info']
 * @param {number} [duration=3000]
 */
export function show(input, type = 'info', duration = 3000) {
    if (!container) initToast();
    const opts = typeof input === 'string' ? { message: input, type, duration } : input;
    const { message, type: toastType = 'info', duration: dur = 3000 } = opts;

    const toast = createElement('div', {
        className: `toast toast-${toastType}`,
        attrs: { role: 'alert', 'aria-live': 'polite' }
    });
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, dur);
}

/** Shorthand helpers */
export const Toast = {
    show,
    success: (msg, dur) => show({ message: msg, type: 'success', duration: dur }),
    error: (msg, dur) => show({ message: msg, type: 'error', duration: dur || 4000 }),
    info: (msg, dur) => show({ message: msg, type: 'info', duration: dur }),
    warning: (msg, dur) => show({ message: msg, type: 'warning', duration: dur })
};
