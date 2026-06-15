import { APP_CONFIG } from '../../config/app-config.js';
import { TOKEN_REFRESH_BUFFER_SEC } from '../../config/constants.js';
import { localStorageAdapter } from '../../storage/local-storage-adapter.js';

/**
 * JWT token storage and expiry helpers.
 * Tokens stored in localStorage until httpOnly cookies are supported by backend.
 */
export const TokenManager = {
    /**
     * Get access token.
     * @returns {string|null}
     */
    getToken() {
        return localStorageAdapter.getString(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    },

    /**
     * Save access token.
     * @param {string} token
     */
    setToken(token) {
        localStorageAdapter.setString(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN, token);
    },

    /**
     * Get refresh token.
     * @returns {string|null}
     */
    getRefreshToken() {
        return localStorageAdapter.getString(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    },

    /**
     * Save refresh token.
     * @param {string} token
     */
    setRefreshToken(token) {
        localStorageAdapter.setString(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN, token);
    },

    /**
     * Save both tokens from login response.
     * @param {{ accessToken?: string, refreshToken?: string, token?: string }} data
     */
    setTokens(data) {
        const access = data.accessToken || data.token;
        if (access) this.setToken(access);
        if (data.refreshToken) this.setRefreshToken(data.refreshToken);
    },

    /**
     * Remove all tokens.
     */
    removeToken() {
        localStorageAdapter.remove(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        localStorageAdapter.remove(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    },

    /**
     * Decode JWT payload without verification (client-side expiry check only).
     * @param {string} [token]
     * @returns {object|null}
     */
    decodePayload(token) {
        const t = token || this.getToken();
        if (!t) return null;
        try {
            const parts = t.split('.');
            if (parts.length < 2) return null;
            const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(json);
        } catch {
            return null;
        }
    },

    /**
     * Check if access token is expired or near expiry.
     * @param {number} [bufferSec]
     * @returns {boolean}
     */
    isTokenExpired(bufferSec = TOKEN_REFRESH_BUFFER_SEC) {
        const payload = this.decodePayload();
        if (!payload?.exp) return !this.getToken();
        const now = Math.floor(Date.now() / 1000);
        return payload.exp <= now + bufferSec;
    },

    /**
     * Whether a valid (non-expired) access token exists.
     * @returns {boolean}
     */
    hasValidToken() {
        return !!this.getToken() && !this.isTokenExpired(0);
    }
};
