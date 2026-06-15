import { STORAGE_KEYS, STORAGE_PREFIX } from '../config/storage-keys.js';

/** Former storage prefix (pre-rename) — kept for one-time localStorage migration */
const LEGACY_PREFIX = `${String.fromCodePoint(84, 83, 81, 67, 66)}_`;

/**
 * One-time migration: rename legacy localStorage keys to current prefix.
 * Preserves user data from older builds.
 */
export function migrateLegacyStorageKeys() {
    if (localStorage.getItem(STORAGE_KEYS.LEGACY_KEY_MIGRATION) === 'done') {
        return;
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(LEGACY_PREFIX)) continue;

        const newKey = STORAGE_PREFIX + key.slice(LEGACY_PREFIX.length);
        if (!localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, localStorage.getItem(key));
        }
        localStorage.removeItem(key);
    }

    localStorage.setItem(STORAGE_KEYS.LEGACY_KEY_MIGRATION, 'done');
}
