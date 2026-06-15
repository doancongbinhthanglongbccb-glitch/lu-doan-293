/**
 * Send success JSON response.
 * @param {import('express').Response} res
 * @param {*} [data]
 * @param {string} [message]
 * @param {number} [status]
 */
export function sendSuccess(res, data = null, message = 'OK', status = 200) {
    const body = { success: true, message };
    if (data !== null && data !== undefined) {
        body.data = data;
    }
    res.status(status).json(body);
}

/**
 * Send error JSON response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [status]
 * @param {*} [extra]
 */
export function sendError(res, message, status = 400, extra = null) {
    const body = { success: false, message };
    if (extra) body.data = extra;
    res.status(status).json(body);
}

/**
 * Send auth login/refresh response — flat shape for frontend compatibility.
 * @param {import('express').Response} res
 * @param {object} payload
 * @param {string} [message]
 */
export function sendAuthSuccess(res, payload, message = 'OK') {
    res.status(200).json({
        success: true,
        message,
        ...payload
    });
}
