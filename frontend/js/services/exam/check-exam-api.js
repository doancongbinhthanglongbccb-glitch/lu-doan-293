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
 */
export async function getReadiness(sessionId) {
    const { data } = await apiClient.get(`/exam/sessions/${sessionId}/readiness`, { silent: true });
    return unwrapPayload(data);
}

/**
 * @param {number} sessionId
 */
export async function startSession(sessionId) {
    const { data } = await apiClient.post(`/exam/sessions/${sessionId}/start`, {}, { silent: true });
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
