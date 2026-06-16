import { localStorageAdapter } from './local-storage-adapter.js';
import { APP_CONFIG } from '../config/index.js';

/**
 * Read users cache from localStorage.
 * @returns {object|null}
 */
export function getCachedUsers() {
    return localStorageAdapter.getJSON(APP_CONFIG.STORAGE_KEYS.USERS_DATA);
}

/**
 * Cache users list locally.
 * @param {object} data
 */
export function saveUsers(data) {
    localStorageAdapter.setJSON(APP_CONFIG.STORAGE_KEYS.USERS_DATA, data);
}

/**
 * Ensure users payload has array shape.
 * @param {object|null} data
 * @returns {{ users: object[] }}
 */
export function normalizeUsers(data) {
    if (!data || !Array.isArray(data.users)) {
        return { users: [] };
    }
    return data;
}

/**
 * Get current session user.
 * @returns {object|null}
 */
export function getCurrentUser() {
    return localStorageAdapter.getJSON(APP_CONFIG.STORAGE_KEYS.CURRENT_USER);
}

/**
 * Save current session user.
 * @param {object} session
 */
export function saveCurrentUser(session) {
    localStorageAdapter.setJSON(APP_CONFIG.STORAGE_KEYS.CURRENT_USER, session);
}

/**
 * Clear current session.
 */
export function clearCurrentUser() {
    localStorageAdapter.remove(APP_CONFIG.STORAGE_KEYS.CURRENT_USER);
}
