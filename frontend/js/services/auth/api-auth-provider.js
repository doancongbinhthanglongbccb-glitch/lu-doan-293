import { AuthProvider } from './auth-provider.js';
import {
    USER_STATUS,
    MILITARY_ID_PATTERN,
    MIN_PASSWORD_LENGTH,
    EVENTS
} from '../../config/index.js';
import { eventBus } from '../../core/event-bus.js';
import { apiClient } from '../api/api-client.js';
import { TokenManager } from './token-manager.js';
import * as userRepo from '../../storage/user-repository.js';

/**
 * Authentication via REST API + JWT (production).
 */
export class ApiAuthProvider extends AuthProvider {
    constructor() {
        super();
        /** @type {object|null} */
        this._usersCache = null;
    }

    /** @inheritdoc */
    isValidMilitaryId(militaryId) {
        return MILITARY_ID_PATTERN.test(String(militaryId || '').trim());
    }

    /**
     * Load users list from API (admin).
     * @returns {Promise<object>}
     */
    async initUsers() {
        if (this._usersCache) return this._usersCache;
        const { data } = await apiClient.get('/users');
        this._usersCache = { users: data.users || data.data?.users || [] };
        userRepo.saveUsers(this._usersCache);
        return this._usersCache;
    }

    /** @returns {object[]} */
    getUsers() {
        return this._usersCache ? this._usersCache.users : [];
    }

    /** @returns {Promise<object[]>} */
    async getAllUsers() {
        await this.initUsers();
        return this.getUsers();
    }

    /**
     * @param {string} militaryId
     * @param {string} password
     */
    async login(militaryId, password) {
        try {
            const { data } = await apiClient.post(
                '/auth/login',
                { militaryId: String(militaryId).trim(), password },
                { skipAuth: true }
            );

            TokenManager.setTokens(data);
            const user = data.user;
            const session = {
                militaryId: user.militaryId,
                fullName: user.fullName,
                role: user.role,
                status: user.status,
                loginAt: new Date().toISOString()
            };
            userRepo.saveCurrentUser(session);
            eventBus.emit(EVENTS.AUTH_LOGIN_SUCCESS, { user: session });
            return { ok: true, user: session };
        } catch (err) {
            eventBus.emit(EVENTS.AUTH_LOGIN_FAILED, { message: err.message });
            return { ok: false, message: err.message || 'Đăng nhập thất bại.' };
        }
    }

    /**
     * @param {string} militaryId
     * @param {string} fullName
     * @param {string} password
     */
    async register(militaryId, fullName, password) {
        militaryId = String(militaryId).trim();
        fullName = String(fullName).trim();

        if (!this.isValidMilitaryId(militaryId)) {
            return { ok: false, message: 'Số quân nhân phải đúng 8 chữ số.' };
        }
        if (!fullName) return { ok: false, message: 'Vui lòng nhập họ và tên.' };
        if (!password || password.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
        }

        try {
            const { data } = await apiClient.post(
                '/auth/register',
                { militaryId, fullName, password },
                { skipAuth: true }
            );
            return {
                ok: true,
                message: data.message || 'Đã gửi yêu cầu đăng ký. Chờ Admin phê duyệt.'
            };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /** @inheritdoc */
    async logout() {
        try {
            await apiClient.post('/auth/logout', null, { silent: true });
        } catch {
            /* ignore */
        }
        TokenManager.removeToken();
        userRepo.clearCurrentUser();
        this._usersCache = null;
        eventBus.emit(EVENTS.AUTH_LOGOUT);
    }

    /** @inheritdoc */
    getCurrentUser() {
        return userRepo.getCurrentUser();
    }

    /**
     * Refresh session from API (/auth/me).
     * @returns {Promise<object|null>}
     */
    async fetchCurrentUser() {
        if (!TokenManager.getToken()) return null;
        try {
            const { data } = await apiClient.get('/auth/me');
            const user = data.user || data.data?.user || data;
            const session = {
                militaryId: user.militaryId,
                fullName: user.fullName,
                role: user.role,
                status: user.status,
                loginAt: new Date().toISOString()
            };
            userRepo.saveCurrentUser(session);
            return session;
        } catch {
            TokenManager.removeToken();
            userRepo.clearCurrentUser();
            return null;
        }
    }

    /** @param {string} militaryId */
    async approveUser(militaryId) {
        try {
            await apiClient.patch(`/users/${militaryId}/approve`);
            this._usersCache = null;
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /** @param {string} militaryId */
    async rejectUser(militaryId) {
        try {
            await apiClient.patch(`/users/${militaryId}/reject`);
            this._usersCache = null;
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /**
     * @param {string} militaryId
     * @param {object} data
     */
    async updateUser(militaryId, data) {
        try {
            await apiClient.patch(`/users/${militaryId}`, data);
            this._usersCache = null;
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /**
     * @param {string} militaryId
     * @param {string} newPassword
     */
    async resetPassword(militaryId, newPassword) {
        if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, message: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
        }
        try {
            await apiClient.post(`/users/${militaryId}/reset-password`, { newPassword });
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /** @param {string} militaryId */
    async deleteUser(militaryId) {
        try {
            await apiClient.delete(`/users/${militaryId}`);
            this._usersCache = null;
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    /** @param {string} status */
    getStatusLabel(status) {
        const map = {
            [USER_STATUS.PENDING]: 'Chờ duyệt',
            [USER_STATUS.APPROVED]: 'Đã duyệt',
            [USER_STATUS.REJECTED]: 'Từ chối'
        };
        return map[status] || status;
    }

    /** @param {object|null} user */
    getUserKey(user) {
        if (!user) return 'guest';
        return user.militaryId || user.username || 'guest';
    }
}
