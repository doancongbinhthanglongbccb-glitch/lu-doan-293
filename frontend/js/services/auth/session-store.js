import { TokenManager } from './token-manager.js';
import * as userRepo from '../../storage/user-repository.js';

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

/** Clear JWT tokens and cached current user. */
export function clearLocalSession() {
    TokenManager.removeToken();
    userRepo.clearCurrentUser();
}
