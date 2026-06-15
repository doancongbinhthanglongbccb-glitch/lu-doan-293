/**
 * Auth provider interface — implement for local or API backend.
 * @abstract
 */
export class AuthProvider {
    /** @returns {Promise<object>} */
    async initUsers() {
        throw new Error('Not implemented');
    }

    /** @returns {object[]} */
    getUsers() {
        throw new Error('Not implemented');
    }

    /**
     * @param {string} militaryId
     * @param {string} password
     * @returns {Promise<{ ok: boolean, message?: string, user?: object }>}
     */
    async login(_militaryId, _password) {
        throw new Error('Not implemented');
    }

    /**
     * @param {string} militaryId
     * @param {string} fullName
     * @param {string} password
     * @returns {Promise<{ ok: boolean, message: string }>}
     */
    async register(_militaryId, _fullName, _password) {
        throw new Error('Not implemented');
    }

    logout() {
        throw new Error('Not implemented');
    }

    /** @returns {object|null} */
    getCurrentUser() {
        throw new Error('Not implemented');
    }

    /** @returns {boolean} */
    isLoggedIn() {
        return !!this.getCurrentUser();
    }

    /** @returns {boolean} */
    isAdmin() {
        const user = this.getCurrentUser();
        return user?.role === 'admin';
    }

    /**
     * @param {string} [redirectTo]
     * @returns {boolean}
     */
    requireAuth(redirectTo = 'login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    /**
     * @param {string} [redirectTo]
     * @returns {boolean}
     */
    requireAdmin(redirectTo = 'index.html') {
        if (!this.requireAuth()) return false;
        if (!this.isAdmin()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }
}
