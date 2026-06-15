import { $, createElement } from '../utils/dom.js';

/** @type {HTMLElement|null} */
let overlay = null;

/**
 * Initialize global loading overlay.
 */
export function initLoading() {
    if ($('loadingOverlay')) {
        overlay = $('loadingOverlay');
        return;
    }
    overlay = createElement('div', {
        className: 'loading-overlay',
        attrs: { id: 'loadingOverlay', 'aria-hidden': 'true', role: 'status' }
    });
    overlay.innerHTML =
        '<div class="loading-spinner" aria-label="Đang tải"></div><p class="loading-text">Đang tải...</p>';
    document.body.appendChild(overlay);
}

/**
 * Show loading overlay.
 * @param {string} [message='Đang tải...']
 */
export function showLoading(message = 'Đang tải...') {
    if (!overlay) initLoading();
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = message;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
}

/**
 * Hide loading overlay.
 */
export function hideLoading() {
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

/**
 * Wrap async function with loading indicator.
 * @param {Function} fn
 * @param {string} [message]
 * @returns {Function}
 */
export function withLoading(fn, message) {
    return async (...args) => {
        showLoading(message);
        try {
            return await fn(...args);
        } finally {
            hideLoading();
        }
    };
}
