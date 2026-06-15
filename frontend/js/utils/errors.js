import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';

/**
 * User-friendly error messages for common failures.
 * @type {Record<string, string>}
 */
const ERROR_MESSAGES = {
    NETWORK: 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.',
    STORAGE: 'Không thể lưu dữ liệu. Hãy kiểm tra dung lượng trình duyệt.',
    PARSE: 'Dữ liệu không hợp lệ. Vui lòng thử lại hoặc liên hệ quản trị viên.',
    AUTH: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
    QUIZ_LOAD: 'Không có dữ liệu câu hỏi. Vui lòng đăng nhập Admin để import dữ liệu.',
    EXCEL: 'Lỗi đọc file Excel. Kiểm tra định dạng file.',
    UNKNOWN: 'Đã xảy ra lỗi. Vui lòng thử lại.'
};

/**
 * Map error to user-friendly message.
 * @param {Error|string} error
 * @param {string} [fallbackKey='UNKNOWN']
 * @returns {string}
 */
export function getUserMessage(error, fallbackKey = 'UNKNOWN') {
    if (typeof error === 'string') return error;
    const msg = error?.message || '';
    if (msg.includes('fetch') || msg.includes('network')) return ERROR_MESSAGES.NETWORK;
    if (msg.includes('JSON') || msg.includes('parse')) return ERROR_MESSAGES.PARSE;
    if (msg.includes('câu hỏi')) return msg;
    return ERROR_MESSAGES[fallbackKey] || msg || ERROR_MESSAGES.UNKNOWN;
}

/**
 * Handle error with console log and toast notification.
 * @param {Error|string} error
 * @param {Object} [options]
 * @param {string} [options.context] - Context label for console
 * @param {string} [options.fallbackKey]
 * @param {boolean} [options.silent] - Skip toast
 * @returns {string} User message
 */
export function handleError(error, { context, fallbackKey, silent = false } = {}) {
    const userMsg = getUserMessage(error, fallbackKey);
    console.error(context ? `[${context}]` : '[Error]', error);
    if (!silent) {
        eventBus.emit(EVENTS.UI_TOAST, { message: userMsg, type: 'error' });
    }
    return userMsg;
}

/**
 * Wrap async function with unified error handling.
 * @param {Function} fn
 * @param {Object} [options]
 * @returns {Function}
 */
export function withErrorHandling(fn, options = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (err) {
            handleError(err, options);
            throw err;
        }
    };
}

export { ERROR_MESSAGES };
