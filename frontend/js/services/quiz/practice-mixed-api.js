import { apiClient } from '../api/api-client.js';
import { unwrapPayload } from '../api/api-response.js';

/**
 * @returns {Promise<object[]>}
 */
export async function loadSets() {
    const { data } = await apiClient.get('/quiz/practice-mixed/sets', { silent: true });
    return unwrapPayload(data).sets || [];
}

/**
 * @param {number} setId
 */
export async function loadSet(setId) {
    const { data } = await apiClient.get(`/quiz/practice-mixed/sets/${setId}`, { silent: true });
    return unwrapPayload(data);
}

/**
 * @param {number} setId
 * @param {number} questionId
 */
export async function recordProgress(setId, questionId) {
    const { data } = await apiClient.post(
        `/quiz/practice-mixed/sets/${setId}/progress`,
        { questionId },
        { silent: true }
    );
    return unwrapPayload(data).progress;
}

/**
 * @returns {Promise<number>}
 */
export async function regenerateSets() {
    const { data } = await apiClient.post('/quiz/practice-mixed/regenerate', {}, { silent: true });
    return unwrapPayload(data).setCount;
}
