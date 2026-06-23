import { APP_CONFIG } from '../config/index.js';
import { clone } from '../utils/array.js';
import { assignQuestionHash, legacyHashStr } from '../utils/hash.js';
import { sanitizeQuizDataHtml } from '../utils/sanitize-html.js';
import { localStorageAdapter, getHistoryKey } from './local-storage-adapter.js';
import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';
import { apiClient } from '../services/api/api-client.js';
import { unwrapPayload, pickRecords, pickRecord } from '../services/api/api-response.js';

/**
 * @typedef {Object} QuizTopic
 * @property {number} [id]
 * @property {string} title
 * @property {object[]} questions
 */

/**
 * @typedef {Object} QuizData
 * @property {string} title
 * @property {QuizTopic[]} topics
 */

/**
 * Normalize quiz data structure and assign hashes.
 * @param {object|null} data
 * @returns {QuizData}
 */
export function normalizeData(data) {
    if (!data) return { title: APP_CONFIG.APP_NAME, topics: [] };

    if (!data.topics || data.topics.length === 0) {
        data.topics = [{ title: 'Mặc định', questions: data.questions || [] }];
    }

    data.topics.forEach(topic => {
        (topic.questions || []).forEach(q => {
            assignQuestionHash(q);
            if (!q.type) q.type = 'multiplechoice';
            if (!q.answers) q.answers = [];
        });
    });

    return sanitizeQuizDataHtml(data);
}

/**
 * Read quiz cache from localStorage.
 * @returns {QuizData|null}
 */
export function getCachedQuizData() {
    const raw = localStorageAdapter.getJSON(APP_CONFIG.STORAGE_KEYS.QUIZ_DATA);
    return raw ? normalizeData(raw) : null;
}

/**
 * Persist quiz to localStorage cache.
 * @param {object} data
 * @returns {QuizData}
 */
export function cacheQuizData(data) {
    const normalized = normalizeData(clone(data));
    localStorageAdapter.setJSON(APP_CONFIG.STORAGE_KEYS.QUIZ_DATA, normalized);
    eventBus.emit(EVENTS.STORAGE_SAVED, { type: 'quiz' });
    return normalized;
}

/**
 * Load quiz from API; fall back to local cache on failure.
 * @returns {Promise<QuizData>}
 */
export async function loadQuizData() {
    try {
        const { data } = await apiClient.get('/quiz', { silent: true });
        const normalized = normalizeData(unwrapPayload(data));
        cacheQuizData(normalized);
        return normalized;
    } catch (err) {
        if (err.status === 401 || err.status === 403) {
            throw err;
        }
        const cached = getCachedQuizData();
        if (cached) {
            console.warn('[quiz-repository] API load failed, using cache:', err.message);
            return cached;
        }
        throw err;
    }
}

/**
 * Save quiz via API and update local cache.
 * @param {object} data
 * @returns {Promise<QuizData>}
 */
export async function saveQuizData(data) {
    const normalized = normalizeData(clone(data));
    const { data: body } = await apiClient.put('/quiz', normalized, { silent: true });
    const saved = normalizeData(unwrapPayload(body));
    return cacheQuizData(saved);
}

/**
 * Download data as JSON file.
 * @param {object} data
 * @param {string} [filename]
 */
export function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'questions.json';
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Migrate wrong/correct history from legacy hash keys to new hash keys.
 * @param {QuizData} quizData
 */
export function migrateHistoryHashes(quizData) {
    const migrationKey = APP_CONFIG.STORAGE_KEYS.HASH_MIGRATION;
    if (localStorageAdapter.getString(migrationKey) === 'done') return;

    const hashMap = {};
    (quizData.topics || []).forEach(topic => {
        (topic.questions || []).forEach(q => {
            const legacy = String(legacyHashStr(q.contentHtml));
            hashMap[legacy] = q.hash;
        });
    });

    _remapHistoryKeys(APP_CONFIG.STORAGE_KEYS.GLOBAL_WRONG, hashMap);
    _remapHistoryKeys(APP_CONFIG.STORAGE_KEYS.GLOBAL_CORRECT, hashMap);

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
            key.startsWith(APP_CONFIG.STORAGE_KEYS.WRONG_HISTORY_PREFIX) ||
            key.startsWith(APP_CONFIG.STORAGE_KEYS.CORRECT_HISTORY_PREFIX)
        ) {
            _remapHistoryKeys(key, hashMap);
        }
    }

    localStorageAdapter.setString(migrationKey, 'done');
}

/**
 * @param {string} storageKey
 * @param {Record<string, string>} hashMap
 */
function _remapHistoryKeys(storageKey, hashMap) {
    const history = localStorageAdapter.getJSON(storageKey);
    if (!history || typeof history !== 'object') return;

    let changed = false;
    const newHistory = {};

    Object.entries(history).forEach(([key, value]) => {
        const newKey = hashMap[key] || key;
        if (newKey !== key) changed = true;
        newHistory[newKey] = (newHistory[newKey] || 0) + value;
    });

    if (changed) {
        localStorageAdapter.setJSON(storageKey, newHistory);
    }
}

/**
 * Get wrong answer history for user.
 * @param {object|null} user
 * @returns {Record<string, number>}
 */
export function getWrongHistory(user) {
    return _getHistory(user, 'wrong');
}

/**
 * Save wrong answer history.
 * @param {object|null} user
 * @param {Record<string, number>} history
 */
export function saveWrongHistory(user, history) {
    localStorageAdapter.setJSON(getHistoryKey(user, 'wrong'), history);
}

/**
 * Get correct streak history for wrong-review mode.
 * @param {object|null} user
 * @returns {Record<string, number>}
 */
export function getCorrectHistory(user) {
    return _getHistory(user, 'correct');
}

/**
 * Save correct streak history.
 * @param {object|null} user
 * @param {Record<string, number>} history
 */
export function saveCorrectHistory(user, history) {
    localStorageAdapter.setJSON(getHistoryKey(user, 'correct'), history);
}

/**
 * @param {object|null} user
 * @param {'wrong'|'correct'} type
 * @returns {Record<string, number>}
 */
function _getHistory(user, type) {
    const keys = APP_CONFIG.STORAGE_KEYS;
    const userKey = getHistoryKey(user, type);
    const globalKey = type === 'wrong' ? keys.GLOBAL_WRONG : keys.GLOBAL_CORRECT;

    try {
        let history = localStorageAdapter.getJSON(userKey) || {};
        const uid = user?.militaryId || user?.username;
        if (uid && Object.keys(history).length === 0) {
            const global = localStorageAdapter.getJSON(globalKey) || {};
            if (Object.keys(global).length > 0) {
                history = global;
                localStorageAdapter.setJSON(userKey, history);
            }
        }
        return history;
    } catch {
        return {};
    }
}

/**
 * Load wrong/correct history from API and cache locally.
 * @param {object|null} user
 * @returns {Promise<{ wrongHistory: Record<string, number>, correctHistory: Record<string, number> }>}
 */
export async function loadWrongHistoryFromApi(user) {
    const { data } = await apiClient.get('/quiz/wrong-history', { silent: true });
    const payload = unwrapPayload(data);
    const wrongHistory = payload.wrongHistory || {};
    const correctHistory = payload.correctHistory || {};
    saveWrongHistory(user, wrongHistory);
    saveCorrectHistory(user, correctHistory);
    return { wrongHistory, correctHistory };
}

/**
 * Push wrong/correct history to API.
 * @param {object|null} user
 * @param {Record<string, number>} wrongHistory
 * @param {Record<string, number>} correctHistory
 */
export async function syncWrongHistoryToApi(user, wrongHistory, correctHistory) {
    if (!user) return;
    await apiClient.post(
        '/quiz/wrong-history',
        { wrongHistory, correctHistory },
        { silent: true }
    );
}

/**
 * Load exam history from API.
 * @returns {Promise<object[]>}
 */
export async function loadExamHistory(limit = 50) {
    const { data } = await apiClient.get(`/quiz/history?limit=${limit}`, { silent: true });
    return pickRecords(data);
}

/**
 * Load exam history for all users (admin).
 * @param {object} [options]
 * @returns {Promise<object[]>}
 */
export async function loadAllExamHistory({ limit = 100, search = '' } = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (search) params.set('search', search);
    const { data } = await apiClient.get(`/quiz/history/all?${params}`, { silent: true });
    return pickRecords(data);
}

/**
 * Save an exam session to server.
 * @param {object|null} user
 * @param {object} record
 */
export async function saveExamHistory(user, record) {
    if (!user) return null;
    const { data } = await apiClient.post('/quiz/history', record, { silent: true });
    return pickRecord(data);
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _wrongHistorySyncTimer = null;

/**
 * Cache locally and debounce sync to API.
 * @param {object|null} user
 * @param {Record<string, number>} wrongHistory
 * @param {Record<string, number>} correctHistory
 * @param {number} [delayMs]
 */
export function syncWrongHistoryDebounced(user, wrongHistory, correctHistory, delayMs = 800) {
    saveWrongHistory(user, wrongHistory);
    saveCorrectHistory(user, correctHistory);
    if (!user) return;

    if (_wrongHistorySyncTimer) clearTimeout(_wrongHistorySyncTimer);
    _wrongHistorySyncTimer = setTimeout(() => {
        syncWrongHistoryToApi(user, wrongHistory, correctHistory).catch(err => {
            console.warn('[quiz-repository] wrong-history sync failed:', err.message);
        });
    }, delayMs);
}

/**
 * Flush pending wrong-history sync immediately (e.g. before logout).
 * @param {object|null} user
 */
export async function flushWrongHistorySync(user) {
    if (_wrongHistorySyncTimer) {
        clearTimeout(_wrongHistorySyncTimer);
        _wrongHistorySyncTimer = null;
    }
    if (!user) return;
    const wrongHistory = getWrongHistory(user);
    const correctHistory = getCorrectHistory(user);
    await syncWrongHistoryToApi(user, wrongHistory, correctHistory);
}
