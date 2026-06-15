import * as userService from '../services/user.service.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export function listUsers(req, res, next) {
    try {
        const users = userService.listUsers();
        // Frontend reads data.users
        res.json({ success: true, message: 'OK', users });
    } catch (err) {
        next(err);
    }
}

export function updateUser(req, res, next) {
    try {
        const user = userService.updateUser(req.params.militaryId, req.body);
        sendSuccess(res, { user }, 'Cập nhật người dùng thành công.');
    } catch (err) {
        next(err);
    }
}

export function approveUser(req, res, next) {
    try {
        const user = userService.approveUser(req.params.militaryId);
        sendSuccess(res, { user }, 'Đã phê duyệt người dùng.');
    } catch (err) {
        next(err);
    }
}

export function rejectUser(req, res, next) {
    try {
        const user = userService.rejectUser(req.params.militaryId);
        sendSuccess(res, { user }, 'Đã từ chối người dùng.');
    } catch (err) {
        next(err);
    }
}

export async function resetPassword(req, res, next) {
    try {
        await authService.resetPassword(req.params.militaryId, req.body.newPassword);
        sendSuccess(res, null, 'Đặt lại mật khẩu thành công.');
    } catch (err) {
        next(err);
    }
}

export function deleteUser(req, res, next) {
    try {
        userService.deleteUser(req.params.militaryId, req.user.military_id);
        sendSuccess(res, null, 'Đã xóa người dùng.');
    } catch (err) {
        next(err);
    }
}
