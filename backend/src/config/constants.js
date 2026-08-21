export {
    USER_ROLES,
    USER_STATUS,
    MILITARY_ID_LENGTH,
    MIN_PASSWORD_LENGTH,
    DEFAULT_ADMIN
} from '../../../shared/constants/user.js';

export const TOKEN_TYPES = {
    ACCESS: 'access',
    REFRESH: 'refresh'
};

export const DEFAULT_QUIZ_TITLE = 'HỆ THỐNG ÔN - THI TRẮC NGHIỆM';

export const DEFAULT_BATTALION_NAME = 'Chưa phân loại';

export const DEFAULT_PRACTICE_MIXED_QUESTION_COUNT = 30;

export const DEFAULT_PRACTICE_MIXED_SET_COUNT = 5;

export const DEFAULT_EXAM_TIME_BUFFER_MINUTES = 30;

export const EXAM_SESSION_STATUS = {
    DRAFT: 'draft',
    OPEN: 'open',
    CLOSED: 'closed'
};

export const EXAM_SESSION_TYPES = {
    TOPIC: 'topic',
    MIXED: 'mixed'
};

export const LECTURE_TYPES = {
    VIDEO: 'video',
    DOCUMENT: 'document'
};

export const LECTURE_STATUS = {
    PENDING: 'pending',
    READY: 'ready',
    FAILED: 'failed'
};

/** Whitelist MIME tường minh — không mở rộng bằng dấu `...`. */
export const LECTURE_MIME_WHITELIST = ['video/mp4', 'video/webm', 'application/pdf'];

export const LECTURE_MIME_BY_TYPE = {
    [LECTURE_TYPES.VIDEO]: ['video/mp4', 'video/webm'],
    [LECTURE_TYPES.DOCUMENT]: ['application/pdf']
};

export const LECTURE_PUT_EXPIRES_SEC = 20 * 60;
export const LECTURE_GET_EXPIRES_SEC = 90 * 60;

/** Trần độ sâu CTE cây topic — chặn treo khi parent_id tạo chu trình. */
export const TOPIC_TREE_MAX_DEPTH = 32;

/** Số lần trả lời đúng liên tiếp để gỡ câu khỏi ôn-lại-câu-sai. */
export const WRONG_REVIEW_CORRECT_THRESHOLD = 3;
