import { apiClient } from '../api/api-client.js';
import { unwrapPayload } from '../api/api-response.js';

/**
 * @returns {Promise<object[]>}
 */
export async function loadOpenSessions() {
    const { data } = await apiClient.get('/exam/sessions/open', { silent: true });
    return unwrapPayload(data).sessions || [];
}

/**
 * @param {number} sessionId
 * @param {number} [topicId]
 */
export async function getReadiness(sessionId, topicId) {
    const query = topicId ? `?topicId=${topicId}` : '';
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/readiness${query}`, {
        silent: true
    });
    return unwrapPayload(data);
}

/**
 * @param {number} sessionId
 */
export async function loadSessionTopics(sessionId) {
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/topics`, { silent: true });
    return unwrapPayload(data).topics || [];
}

/**
 * @param {number} sessionId
 */
export async function loadBranches(sessionId) {
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/branches`, { silent: true });
    return unwrapPayload(data);
}

/**
 * @param {number} sessionId
 * @param {number|null} [topicId]
 */
export async function loadSets(sessionId, topicId = null) {
    const query = topicId ? `?topicId=${topicId}` : '';
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/sets${query}`, { silent: true });
    return unwrapPayload(data).sets || [];
}

/**
 * @param {number} sessionId
 * @param {{ topicId?: number }} [body]
 */
export async function startSession(sessionId, body = {}) {
    const { data } = await apiClient.post(`/exam/sessions/${sessionId}/start`, body, {
        silent: true
    });
    return unwrapPayload(data);
}

/**
 * @param {number} sessionId
 * @param {object} payload
 */
export async function submitSession(sessionId, payload) {
    const { data } = await apiClient.post(`/exam/sessions/${sessionId}/submit`, payload, {
        silent: true
    });
    return unwrapPayload(data);
}

/**
 * @returns {Promise<object[]>}
 */
export async function loadSessionsAdmin() {
    const { data } = await apiClient.get('/exam/sessions', { silent: true });
    return unwrapPayload(data).sessions || [];
}

/**
 * @param {object} body
 */
export async function createSessionAdmin(body) {
    const { data } = await apiClient.post('/exam/sessions', body, { silent: true });
    return unwrapPayload(data).session;
}

/**
 * @param {number} id
 * @param {boolean} confirmRegenerate
 */
export async function openSessionAdmin(id, confirmRegenerate = false) {
    const { data } = await apiClient.post(
        `/exam/sessions/${id}/open`,
        { confirmRegenerate },
        { silent: true }
    );
    return unwrapPayload(data).session;
}

/**
 * @param {number} id
 */
export async function closeSessionAdmin(id) {
    const { data } = await apiClient.post(`/exam/sessions/${id}/close`, {}, { silent: true });
    return unwrapPayload(data).session;
}

/**
 * @param {number} id
 */
export async function regenerateSessionAdmin(id) {
    const { data } = await apiClient.post(`/exam/sessions/${id}/regenerate`, {}, { silent: true });
    return unwrapPayload(data).session;
}

/**
 * @param {object} [params]
 * @returns {Promise<object[]>}
 */
export async function loadCheckHistory({ limit = 50, branch = '' } = {}) {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (branch) query.set('branch', branch);
    const { data } = await apiClient.get(`/exam/history?${query}`, { silent: true });
    return unwrapPayload(data).records || [];
}

/**
 * @param {object} [params]
 * @returns {Promise<object[]>}
 */
export async function loadCheckHistoryAdmin({
    limit = 200,
    search = '',
    battalionId = '',
    branch = ''
} = {}) {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (search) query.set('search', search);
    if (battalionId) query.set('battalionId', String(battalionId));
    if (branch) query.set('branch', branch);
    const { data } = await apiClient.get(`/exam/history/all?${query}`, { silent: true });
    return unwrapPayload(data).records || [];
}

/**
 * @param {number} sessionId
 */
export async function loadProgressMatrix(sessionId) {
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/progress-matrix`, {
        silent: true
    });
    return unwrapPayload(data);
}
