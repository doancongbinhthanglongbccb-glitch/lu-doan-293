import { verifyToken } from '../utils/jwt.js';
import { TOKEN_TYPES, USER_STATUS } from '../config/constants.js';
import { sendError } from '../utils/response.js';
import * as userModel from '../models/user.model.js';

/**
 * Require valid Bearer access token.
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return sendError(res, 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.', 401);
    }

    try {
        const payload = verifyToken(token);
        if (payload.type !== TOKEN_TYPES.ACCESS) {
            return sendError(res, 'Token không hợp lệ.', 401);
        }

        const user = userModel.findById(payload.sub);
        if (!user) {
            return sendError(res, 'Người dùng không tồn tại.', 401);
        }

        if (user.status !== USER_STATUS.APPROVED) {
            return sendError(res, 'Tài khoản chưa được phê duyệt hoặc đã bị từ chối.', 403);
        }

        req.user = user;
        req.tokenPayload = payload;
        next();
    } catch {
        return sendError(res, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
}
