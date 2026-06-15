import { normalizeHtml } from './html.js';

/**
 * FNV-1a 32-bit hash — better distribution than djb2.
 * @param {string} str
 * @returns {string} Hex hash string
 */
export function hashString(str) {
    let hash = 0x811c9dc5;
    const s = str || '';
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Legacy hash (djb2) — used for migrating old wrong-history keys.
 * @param {string} str
 * @returns {number}
 */
export function legacyHashStr(str) {
    let hash = 0;
    if (!str) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
}

/**
 * Compute stable question hash from content, type, and answers.
 * @param {object} q - Question object
 * @returns {string}
 */
export function computeQuestionHash(q) {
    const parts = [
        q.type || 'multiplechoice',
        normalizeHtml(q.contentHtml || '')
    ];
    (q.answers || []).forEach(a => {
        parts.push(`${a.letter || ''}:${normalizeHtml(a.html || '')}:${!!a.isCorrect}`);
    });
    return hashString(parts.join('|'));
}

/**
 * Assign hash to question — uses improved algorithm, stores legacy for migration.
 * @param {object} q
 */
export function assignQuestionHash(q) {
    q.legacyHash = String(legacyHashStr(q.contentHtml));
    q.hash = computeQuestionHash(q);
}
