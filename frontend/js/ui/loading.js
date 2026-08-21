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
        '<div class="loading-spinner" aria-label="Đang tải"></div>' +
        '<p class="loading-text">Đang tải...</p>' +
        '<div class="loading-progress-wrap" hidden>' +
        '<progress class="loading-progress" max="100" value="0"></progress>' +
        '</div>';
    document.body.appendChild(overlay);
}

/**
 * Show loading overlay.
 * @param {string} [message='Đang tải...']
 * @param {{ percent?: number }} [opts] `percent` 0–100 hiện thanh tiến độ (upload tệp).
 */
export function showLoading(message = 'Đang tải...', opts = {}) {
    if (!overlay) initLoading();
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = message;
    const wrap = overlay.querySelector('.loading-progress-wrap');
    const bar = overlay.querySelector('.loading-progress');
    const percent = opts.percent;
    if (wrap && bar) {
        if (percent == null || Number.isNaN(Number(percent))) {
            wrap.hidden = true;
        } else {
            wrap.hidden = false;
            bar.value = Math.max(0, Math.min(100, Math.round(Number(percent))));
        }
    }
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
    const wrap = overlay.querySelector('.loading-progress-wrap');
    if (wrap) wrap.hidden = true;
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
