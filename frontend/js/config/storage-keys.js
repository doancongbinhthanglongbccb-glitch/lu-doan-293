/** Application prefix for localStorage keys */
export const STORAGE_PREFIX = 'cbquiz_';

/**
 * LocalStorage / session key constants.
 * @readonly
 */
export const STORAGE_KEYS = {
    CURRENT_USER: `${STORAGE_PREFIX}current_user`,
    QUIZ_DATA: `${STORAGE_PREFIX}quiz_data`,
    USERS_DATA: `${STORAGE_PREFIX}users_data`,
    THEME: `${STORAGE_PREFIX}theme`,
    WRONG_HISTORY_PREFIX: `${STORAGE_PREFIX}wrong_history_`,
    CORRECT_HISTORY_PREFIX: `${STORAGE_PREFIX}correct_history_`,
    GLOBAL_WRONG: `${STORAGE_PREFIX}global_wrong_history`,
    GLOBAL_CORRECT: `${STORAGE_PREFIX}global_correct_history`,
    HASH_MIGRATION: `${STORAGE_PREFIX}hash_migration_v2`,
    LEGACY_KEY_MIGRATION: `${STORAGE_PREFIX}legacy_key_migration`,
    ACCESS_TOKEN: `${STORAGE_PREFIX}access_token`,
    REFRESH_TOKEN: `${STORAGE_PREFIX}refresh_token`
};
