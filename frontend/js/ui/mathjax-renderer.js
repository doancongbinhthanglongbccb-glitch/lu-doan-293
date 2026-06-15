/** @type {Set<HTMLElement>} */
const pendingElements = new Set();

/** @type {number|null} */
let debounceTimer = null;

const DEBOUNCE_MS = 50;

/**
 * Queue element for MathJax typesetting (debounced).
 * @param {HTMLElement} element
 */
export function queueTypeset(element) {
    if (!element) return;
    pendingElements.add(element);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flushTypeset(), DEBOUNCE_MS);
}

/**
 * Flush all pending MathJax typeset requests.
 * @returns {Promise<void>}
 */
export async function flushTypeset() {
    debounceTimer = null;
    if (!pendingElements.size || !window.MathJax?.typesetPromise) {
        pendingElements.clear();
        return;
    }
    const elements = Array.from(pendingElements);
    pendingElements.clear();
    try {
        await MathJax.typesetPromise(elements);
    } catch {
        /* MathJax may fail on empty content */
    }
}

/**
 * Typeset immediately without debounce.
 * @param {HTMLElement} element
 * @returns {Promise<void>}
 */
export async function typesetNow(element) {
    if (!element || !window.MathJax?.typesetPromise) return;
    try {
        await MathJax.typesetPromise([element]);
    } catch {
        /* ignore */
    }
}

/**
 * Clear MathJax cache for an element before re-render.
 * @param {HTMLElement} element
 */
export function clearMathJax(element) {
    if (window.MathJax?.typesetClear) {
        MathJax.typesetClear([element]);
    }
}
