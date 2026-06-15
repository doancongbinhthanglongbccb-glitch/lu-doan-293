import * as authService from '../services/auth.service.js';
import { sendAuthSuccess, sendSuccess, sendError } from '../utils/response.js';

export async function login(req, res, next) {
    try {
        const { militaryId, password } = req.body;
        const result = await authService.login(militaryId, password);
        sendAuthSuccess(res, result, 'Đăng nhập thành công.');
    } catch (err) {
        next(err);
    }
}

export async function register(req, res, next) {
    try {
        const result = await authService.register(req.body);
        sendSuccess(res, { user: result.user }, result.message, 201);
    } catch (err) {
        next(err);
    }
}

export function logout(req, res, next) {
    try {
        const refreshToken = req.body?.refreshToken;
        authService.logout(req.user.id, refreshToken);
        sendSuccess(res, null, 'Đăng xuất thành công.');
    } catch (err) {
        next(err);
    }
}

export function me(req, res, next) {
    try {
        const user = authService.getMe(req.user);
        // Flat { user } for frontend: data.user || data
        res.json({ success: true, message: 'OK', user });
    } catch (err) {
        next(err);
    }
}

export function refresh(req, res, next) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return sendError(res, 'Thiếu refresh token.', 400);
        }
        const result = authService.refresh(refreshToken);
        sendAuthSuccess(res, result, 'Token đã được làm mới.');
    } catch (err) {
        next(err);
    }
}
