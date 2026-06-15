import { sendError } from '../utils/response.js';
import { USER_ROLES } from '../config/constants.js';

/**
 * Require authenticated admin user.
 * @type {import('express').RequestHandler}
 */
export function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== USER_ROLES.ADMIN) {
        return sendError(res, 'Bạn không có quyền thực hiện thao tác này.', 403);
    }
    next();
}
