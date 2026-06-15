import * as userModel from '../models/user.model.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
    signAccessToken,
    signRefreshToken,
    verifyToken,
    hashToken,
    getTokenExpiry
} from '../utils/jwt.js';
import { TOKEN_TYPES, USER_STATUS, MIN_PASSWORD_LENGTH } from '../config/constants.js';

/**
 * Issue access + refresh tokens and persist refresh token hash.
 * @param {object} userRow
 */
function issueTokens(userRow) {
    const tokenUser = {
        id: userRow.id,
        militaryId: userRow.military_id,
        role: userRow.role
    };

    const accessToken = signAccessToken(tokenUser);
    const refreshToken = signRefreshToken(tokenUser);
    const tokenHash = hashToken(refreshToken);

    userModel.saveRefreshToken(userRow.id, tokenHash, getTokenExpiry(refreshToken));

    return {
        accessToken,
        refreshToken,
        user: userModel.toPublicUser(userRow)
    };
}

/**
 * @param {string} militaryId
 * @param {string} password
 */
export async function login(militaryId, password) {
    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Sai số quân nhân hoặc mật khẩu.');
        err.status = 401;
        throw err;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
        const err = new Error('Sai số quân nhân hoặc mật khẩu.');
        err.status = 401;
        throw err;
    }

    if (user.status === USER_STATUS.PENDING) {
        const err = new Error('Tài khoản chưa được Admin phê duyệt.');
        err.status = 403;
        throw err;
    }

    if (user.status === USER_STATUS.REJECTED) {
        const err = new Error('Tài khoản đã bị từ chối.');
        err.status = 403;
        throw err;
    }

    return issueTokens(user);
}

/**
 * @param {{ militaryId: string, fullName: string, password: string }} data
 */
export async function register(data) {
    const existing = userModel.findByMilitaryId(data.militaryId);
    if (existing) {
        const err = new Error('Số quân nhân đã được đăng ký.');
        err.status = 409;
        throw err;
    }

    const passwordHash = await hashPassword(data.password);
    const user = userModel.createUser({
        militaryId: data.militaryId,
        fullName: data.fullName,
        passwordHash,
        role: 'user',
        status: USER_STATUS.PENDING
    });

    return {
        message: 'Đã gửi yêu cầu đăng ký. Chờ Admin phê duyệt.',
        user: userModel.toPublicUser(user)
    };
}

/**
 * @param {number} userId
 */
export function logout(userId, refreshToken) {
    if (refreshToken) {
        userModel.revokeRefreshToken(hashToken(refreshToken));
    } else {
        userModel.revokeAllRefreshTokens(userId);
    }
}

/**
 * @param {object} userRow
 */
export function getMe(userRow) {
    return userModel.toPublicUser(userRow);
}

/**
 * @param {string} refreshToken
 */
export function refresh(refreshToken) {
    let payload;
    try {
        payload = verifyToken(refreshToken);
    } catch {
        const err = new Error('Refresh token không hợp lệ hoặc đã hết hạn.');
        err.status = 401;
        throw err;
    }

    if (payload.type !== TOKEN_TYPES.REFRESH) {
        const err = new Error('Refresh token không hợp lệ.');
        err.status = 401;
        throw err;
    }

    const stored = userModel.findRefreshToken(hashToken(refreshToken));
    if (!stored) {
        const err = new Error('Refresh token đã bị thu hồi hoặc hết hạn.');
        err.status = 401;
        throw err;
    }

    const user = userModel.findById(payload.sub);
    if (!user || user.status !== USER_STATUS.APPROVED) {
        const err = new Error('Người dùng không hợp lệ.');
        err.status = 401;
        throw err;
    }

    userModel.revokeRefreshToken(hashToken(refreshToken));
    return issueTokens(user);
}

/**
 * @param {string} militaryId
 * @param {string} newPassword
 */
export async function resetPassword(militaryId, newPassword) {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
        const err = new Error(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
        err.status = 400;
        throw err;
    }

    const user = userModel.findByMilitaryId(militaryId);
    if (!user) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
    }

    const passwordHash = await hashPassword(newPassword);
    userModel.updateByMilitaryId(militaryId, { passwordHash });
    userModel.revokeAllRefreshTokens(user.id);
}
