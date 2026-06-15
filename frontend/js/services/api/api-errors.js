/**
 * Map HTTP status codes and error types to user-friendly Vietnamese messages.
 * @param {number} status
 * @param {string} [serverMessage]
 * @returns {string}
 */
export function mapHttpStatusToMessage(status, serverMessage) {
    if (serverMessage && status !== 500) return serverMessage;

    const map = {
        400: 'Yêu cầu không hợp lệ.',
        401: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
        403: 'Bạn không có quyền thực hiện thao tác này.',
        404: 'Không tìm thấy tài nguyên trên server.',
        409: 'Dữ liệu đã tồn tại hoặc xung đột.',
        422: 'Dữ liệu gửi lên không hợp lệ.',
        429: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
        500: 'Lỗi server. Vui lòng thử lại sau.',
        502: 'Server tạm thời không phản hồi.',
        503: 'Dịch vụ đang bảo trì.',
        504: 'Server phản hồi quá chậm.'
    };
    return map[status] || `Lỗi server (${status}).`;
}

/**
 * @param {Error} error
 * @returns {boolean}
 */
export function isNetworkError(error) {
    return (
        error?.name === 'TypeError' ||
        error?.name === 'AbortError' ||
        error?.code === 'NETWORK_ERROR' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('network')
    );
}

/**
 * Create a structured API error.
 * @param {string} message
 * @param {Object} [meta]
 * @returns {Error}
 */
export function createApiError(message, meta = {}) {
    const err = new Error(message);
    err.name = 'ApiError';
    Object.assign(err, meta);
    return err;
}
