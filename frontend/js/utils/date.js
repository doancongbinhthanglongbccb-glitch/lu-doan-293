/**
 * Date formatting utilities — always Vietnam time, 24h.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';

/**
 * @param {Date|string|number} date
 * @param {{ withSeconds?: boolean }} [opts]
 * @returns {string}
 */
function formatInVietnam(date, { withSeconds = false } = {}) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: VN_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: false
    }).formatToParts(d);
    const get = type => parts.find(p => p.type === type)?.value || '';
    const time = withSeconds
        ? `${get('hour')}:${get('minute')}:${get('second')}`
        : `${get('hour')}:${get('minute')}`;
    return `${get('day')}/${get('month')}/${get('year')} ${time}`;
}

/**
 * Format date for display (giờ VN, 24h, có giây).
 * @param {Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
    return formatInVietnam(date, { withSeconds: true });
}

/**
 * Format ISO / datetime for admin tables (giờ VN, 24h, không giây).
 * @param {string} iso
 * @returns {string}
 */
export function formatExamDate(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(iso);
    return formatInVietnam(d);
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
