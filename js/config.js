/**
 * Cấu hình chung cho ứng dụng TSQCB
 */
const TSQCB_CONFIG = {
    APP_NAME: 'Hệ thống ôn tập trắc nghiệm',
    DATA_URL: 'data/questions.json',
    USERS_URL: 'data/users.json',
    STORAGE_KEYS: {
        CURRENT_USER: 'TSQCB_current_user',
        QUIZ_DATA: 'TSQCB_quiz_data',
        USERS_DATA: 'TSQCB_users_data',
        WRONG_HISTORY_PREFIX: 'TSQCB_wrong_history_',
        CORRECT_HISTORY_PREFIX: 'TSQCB_correct_history_',
        GLOBAL_WRONG: 'TSQCB_global_wrong_history',
        GLOBAL_CORRECT: 'TSQCB_global_correct_history'
    },
    USER_STATUS: {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected'
    },
    DEFAULT_ADMIN: {
        militaryId: '00000001',
        fullName: 'Administrator',
        password: 'admin123',
        role: 'admin',
        status: 'approved'
    },
    QUESTION_TYPES: [
        { value: 'multiplechoice', label: 'Trắc Nghiệm' },
        { value: 'Multipleresponse', label: 'Nhiều Đáp Án' },
        { value: 'Truefalse', label: 'Đúng/Sai' },
        { value: 'Fillintheblank', label: 'Điền Khuyết' },
        { value: 'essayquestion', label: 'Tự Luận' }
    ],
    ANSWER_LABELS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
};
