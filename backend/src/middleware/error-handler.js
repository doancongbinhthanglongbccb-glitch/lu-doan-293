import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

/**
 * Global error handler.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    console.error('[error]', err);

    if (err.name === 'UnauthorizedError') {
        return sendError(res, 'Phiên đăng nhập không hợp lệ.', 401);
    }

    const status = err.status || err.statusCode || 500;
    const message =
        status === 500 && !env.isDev
            ? 'Lỗi máy chủ. Vui lòng thử lại sau.'
            : err.message || 'Lỗi máy chủ.';

    sendError(res, message, status);
}

/**
 * 404 handler for unknown API routes.
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, res) {
    sendError(res, `Không tìm thấy: ${req.method} ${req.path}`, 404);
}
