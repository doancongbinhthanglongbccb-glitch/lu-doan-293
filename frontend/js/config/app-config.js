import { STORAGE_KEYS } from './storage-keys.js';
import {
    USER_STATUS,
    QUESTION_TYPE_OPTIONS,
    ANSWER_LABELS,
    API_DEFAULT_RETRIES
} from './constants.js';

/**
 * Main application configuration.
 */
export const APP_CONFIG = {
    APP_NAME: 'Hệ thống ôn tập trắc nghiệm',
    STORAGE_KEYS,
    USER_STATUS,
    QUESTION_TYPES: QUESTION_TYPE_OPTIONS,
    ANSWER_LABELS,

    /** Base URL for REST API (same origin when deployed) */
    API_BASE_URL: '/api',

    /** Request timeout in milliseconds */
    API_TIMEOUT: 15000,

    /** Network retry attempts on transient errors */
    API_RETRIES: API_DEFAULT_RETRIES
};
