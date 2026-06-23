import { TokenManager } from './token-manager.js';
import * as userRepo from '../../storage/user-repository.js';
import { localStorageAdapter } from '../../storage/local-storage-adapter.js';
import { APP_CONFIG } from '../../config/index.js';

/**
 * @param {object} user
 * @returns {object}
 */
export function toSessionUser(user) {
    return {
        militaryId: user.militaryId,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        loginAt: new Date().toISOString()
    };
}

/**
 * @param {object} user
 * @returns {object}
 */
export function saveSessionUser(user) {
    const session = toSessionUser(user);
    userRepo.saveCurrentUser(session);
    return session;
}

/** Clear JWT tokens, cached current user, and quiz cache. */
export function clearLocalSession() {
    TokenManager.removeToken();
    userRepo.clearCurrentUser();
    localStorageAdapter.remove(APP_CONFIG.STORAGE_KEYS.QUIZ_DATA);
}
