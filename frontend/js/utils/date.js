/**
 * Date formatting utilities.
 */

/**
 * Format date for display (12-hour clock).
 * @param {Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    let h = date.getHours();
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12;
    h = h || 12;
    return `${y}-${m}-${d} ${String(h).padStart(2, '0')}:${min}:${sec} ${ampm}`;
}

/**
 * Format elapsed seconds as human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatElapsedTime(seconds) {
    if (seconds < 60) return `${seconds} giây`;
    return `${Math.floor(seconds / 60)} ph ${seconds % 60} s`;
}
