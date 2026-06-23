import { APP_CONFIG } from '../config/index.js';

/**
 * Low-level localStorage adapter with error handling.
 */
export const localStorageAdapter = {
    /**
     * Get and parse JSON from localStorage.
     * @param {string} key
     * @returns {*|null}
     */
    getJSON(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    /**
     * Stringify and save to localStorage.
     * @param {string} key
     * @param {*} value
     */
    setJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    /**
     * Remove key from localStorage.
     * @param {string} key
     */
    remove(key) {
        localStorage.removeItem(key);
    },

    /**
     * Get raw string value.
     * @param {string} key
     * @returns {string|null}
     */
    getString(key) {
        return localStorage.getItem(key);
    },

    /**
     * Set raw string value.
     * @param {string} key
     * @param {string} value
     */
    setString(key, value) {
        localStorage.setItem(key, value);
    }
};

/**
 * Get history storage key for a user.
 * @param {object|null} user
 * @param {'wrong'|'correct'} type
 * @returns {string}
 */
export function getHistoryKey(user, type) {
    const keys = APP_CONFIG.STORAGE_KEYS;
    const uid = _userHistoryId(user);
    if (type === 'wrong') {
        return uid ? keys.WRONG_HISTORY_PREFIX + uid : keys.GLOBAL_WRONG;
    }
    return uid ? keys.CORRECT_HISTORY_PREFIX + uid : keys.GLOBAL_CORRECT;
}

/**
 * @param {object|null} user
 * @returns {string|null}
 */
function _userHistoryId(user) {
    if (!user) return null;
    return user.militaryId || user.username || null;
}
