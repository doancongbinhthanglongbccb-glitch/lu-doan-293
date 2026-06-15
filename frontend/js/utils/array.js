/**
 * Array and object utility helpers.
 */

/**
 * Fisher-Yates shuffle — mutates array in place.
 * @param {Array} arr
 * @returns {Array}
 */
export function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Deep clone via JSON serialization.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
