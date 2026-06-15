/**
 * DOM utility helpers.
 */

/**
 * Shorthand for document.getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $(id) {
    return document.getElementById(id);
}

/**
 * Query a single element.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element|null}
 */
export function query(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Query all matching elements.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element[]}
 */
export function queryAll(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

/**
 * Create an element with optional class and attributes.
 * @param {string} tag
 * @param {Object} [options]
 * @param {string} [options.className]
 * @param {Record<string, string>} [options.attrs]
 * @param {string} [options.text]
 * @returns {HTMLElement}
 */
export function createElement(tag, { className, attrs, text } = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    }
    if (text !== undefined) el.textContent = text;
    return el;
}

/**
 * Show/hide element via display style.
 * @param {HTMLElement|null} el
 * @param {boolean} visible
 * @param {string} [displayValue='flex']
 */
export function setVisible(el, visible, displayValue = 'flex') {
    if (!el) return;
    el.style.display = visible ? displayValue : 'none';
}
