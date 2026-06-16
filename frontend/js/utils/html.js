/**
 * HTML text processing utilities.
 */

/**
 * Escape string for HTML attribute or text node.
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Alias for escapeAttr */
export const escapeHtml = escapeAttr;

import { sanitizeRichHtml } from './sanitize-html.js';

/**
 * Extract plain text from HTML, preserving line breaks from br tags.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
    const withBreaks = sanitizeRichHtml(html || '').replace(/<br\s*\/?>/gi, '\n');
    const doc = new DOMParser().parseFromString(`<div>${withBreaks}</div>`, 'text/html');
    return (doc.body.textContent || '').trim();
}

/**
 * Normalize HTML whitespace for consistent hashing.
 * @param {string} html
 * @returns {string}
 */
export function normalizeHtml(html) {
    return htmlToText(html).replace(/\s+/g, ' ').trim().toLowerCase();
}
