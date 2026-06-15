/**
 * Application-wide constants.
 * User/auth values re-exported from shared (single source of truth).
 */

export {
    USER_STATUS,
    USER_ROLES,
    MILITARY_ID_LENGTH,
    MILITARY_ID_PATTERN,
    MIN_PASSWORD_LENGTH
} from '/shared/constants/user.js';

/** Quiz session modes */
export const QUIZ_MODES = {
    REVIEW: 'review',
    EXAM: 'exam',
    WRONG: 'wrong'
};

/** Review sub-modes */
export const REVIEW_SUB_MODES = {
    TOPIC: 'topic',
    GENERAL: 'general',
    WRONG: 'wrong'
};

/** Result filter modes for review list */
export const FILTER_MODES = {
    ALL: 'all',
    CORRECT: 'dung',
    WRONG: 'sai',
    UNANSWERED: 'chualam'
};

/** Question type identifiers */
export const QUESTION_TYPES = {
    MULTIPLE_CHOICE: 'multiplechoice',
    MULTIPLE_RESPONSE: 'Multipleresponse',
    TRUE_FALSE: 'Truefalse',
    FILL_BLANK: 'Fillintheblank',
    ESSAY: 'essayquestion'
};

/** Answer option letter labels */
export const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Question type display labels */
export const QUESTION_TYPE_LABELS = {
    [QUESTION_TYPES.MULTIPLE_CHOICE]: 'Trắc Nghiệm',
    [QUESTION_TYPES.MULTIPLE_RESPONSE]: 'Nhiều Đáp Án',
    [QUESTION_TYPES.TRUE_FALSE]: 'Đúng/Sai',
    [QUESTION_TYPES.FILL_BLANK]: 'Điền Khuyết',
    [QUESTION_TYPES.ESSAY]: 'Tự Luận'
};

/** Question types for admin select */
export const QUESTION_TYPE_OPTIONS = [
    { value: QUESTION_TYPES.MULTIPLE_CHOICE, label: 'Trắc Nghiệm' },
    { value: QUESTION_TYPES.MULTIPLE_RESPONSE, label: 'Nhiều Đáp Án' },
    { value: QUESTION_TYPES.TRUE_FALSE, label: 'Đúng/Sai' },
    { value: QUESTION_TYPES.FILL_BLANK, label: 'Điền Khuyết' },
    { value: QUESTION_TYPES.ESSAY, label: 'Tự Luận' }
];

/** Wrong-answer review: correct streak needed to remove from wrong list */
export const WRONG_REVIEW_CORRECT_THRESHOLD = 3;

/** Long-press duration for doubt marking (ms) */
export const LONG_PRESS_MS = 600;

/** Timer warning threshold (seconds) */
export const TIMER_DANGER_SECONDS = 60;

/** Virtual scroll activates when question count exceeds this */
export const VIRTUAL_SCROLL_THRESHOLD = 100;

/** Grid visible window size for virtual scroll */
export const VIRTUAL_SCROLL_WINDOW = 50;

/** Exam scoring */
export const EXAM_MAX_SCORE = 10;

/** Default API retry count */
export const API_DEFAULT_RETRIES = 3;

/** Token refresh buffer before expiry (seconds) */
export const TOKEN_REFRESH_BUFFER_SEC = 60;

/** Event bus event names */
export const EVENTS = {
    QUIZ_STARTED: 'quiz:started',
    QUIZ_ANSWER_CHANGED: 'quiz:answer-changed',
    QUIZ_QUESTION_CHANGED: 'quiz:question-changed',
    QUIZ_SUBMITTED: 'quiz:submitted',
    TIMER_TICK: 'timer:tick',
    TIMER_EXPIRED: 'timer:expired',
    STORAGE_SAVED: 'storage:saved',
    AUTH_LOGIN_SUCCESS: 'auth:login-success',
    AUTH_LOGIN_FAILED: 'auth:login-failed',
    AUTH_LOGOUT: 'auth:logout',
    NETWORK_ERROR: 'network:error',
    API_REQUEST_START: 'api:request-start',
    API_REQUEST_END: 'api:request-end',
    UI_TOAST: 'ui:toast',
    UI_MODAL_OPEN: 'ui:modal-open',
    UI_MODAL_CLOSE: 'ui:modal-close',
    THEME_CHANGED: 'theme:changed'
};
