import { localStorageAdapter } from './local-storage-adapter.js';
import { apiClient } from '../services/api/api-client.js';
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
 * Load users from API (admin); cache locally.
 * @returns {Promise<{ users: object[] }>}
 */
export async function loadUsers() {
    const { data } = await apiClient.get('/users', { silent: true });
    const usersData = normalizeUsers({ users: data.users || data.data?.users || [] });
    saveUsers(usersData);
    return usersData;
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
