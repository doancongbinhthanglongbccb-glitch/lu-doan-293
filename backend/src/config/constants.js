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

export const DEFAULT_QUIZ_TITLE = 'Hệ thống ôn tập trắc nghiệm';

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
