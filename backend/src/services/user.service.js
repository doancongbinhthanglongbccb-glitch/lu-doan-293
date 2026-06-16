import * as userModel from '../models/user.model.js';
import { USER_STATUS, USER_ROLES } from '../config/constants.js';

export function listUsers() {
    return userModel.findAll().map(userModel.toPublicUser);
}

/**
 * @returns {number}
 */
function countAdmins() {
    return userModel.findAll().filter(u => u.role === USER_ROLES.ADMIN).length;
}

/**
 * @param {number} userId
 * @param {string} status
 */
function revokeIfNotApproved(userId, status) {
    if (status !== USER_STATUS.APPROVED) {
        userModel.revokeAllRefreshTokens(userId);
    }
}

/**
 * @param {string} militaryId
 * @param {object} data
 */
export function updateUser(militaryId, data) {
    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
    }

    if (data.role === USER_ROLES.USER && user.role === USER_ROLES.ADMIN && countAdmins() <= 1) {
        const err = new Error('Không thể hạ quyền admin cuối cùng.');
        err.status = 400;
        throw err;
    }

    const fields = {};
    if (data.fullName !== undefined) fields.fullName = data.fullName;
    if (data.role !== undefined) fields.role = data.role;
    if (data.status !== undefined) {
        fields.status = data.status;
        revokeIfNotApproved(user.id, data.status);
    }

    const updated = userModel.updateByMilitaryId(militaryId, fields);
    return userModel.toPublicUser(updated);
}

/**
 * @param {string} militaryId
 */
export function approveUser(militaryId) {
    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
    }
    const updated = userModel.updateByMilitaryId(militaryId, { status: USER_STATUS.APPROVED });
    return userModel.toPublicUser(updated);
}

/**
 * @param {string} militaryId
 */
export function rejectUser(militaryId) {
    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
    }
    revokeIfNotApproved(user.id, USER_STATUS.REJECTED);
    const updated = userModel.updateByMilitaryId(militaryId, { status: USER_STATUS.REJECTED });
    return userModel.toPublicUser(updated);
}

/**
 * @param {string} militaryId
 * @param {string} actorMilitaryId
 */
export function deleteUser(militaryId, actorMilitaryId) {
    if (militaryId === actorMilitaryId) {
        const err = new Error('Không thể xóa tài khoản của chính bạn.');
        err.status = 400;
        throw err;
    }

    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
    }

    if (user.role === USER_ROLES.ADMIN && countAdmins() <= 1) {
        const err = new Error('Không thể xóa admin cuối cùng.');
        err.status = 400;
        throw err;
    }

    userModel.revokeAllRefreshTokens(user.id);
    userModel.deleteByMilitaryId(militaryId);
}
