import { apiClient } from './api/api-client.js';
import { unwrapPayload } from './api/api-response.js';

/**
 * @param {{ type?: string, battalion_id?: string|number, status?: string }} [filters]
 * @returns {Promise<object[]>}
 */
export async function listLectures(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.battalion_id) params.set('battalion_id', String(filters.battalion_id));
    const query = params.toString();
    const { data } = await apiClient.get(`/lectures${query ? `?${query}` : ''}`, { silent: true });
    return unwrapPayload(data).lectures || [];
}

/**
 * @param {object} body
 * @returns {Promise<{ id: number, storage_key: string, upload_url: string, expires_in: number }>}
 */
export async function createLecture(body) {
    const { data } = await apiClient.post('/lectures', body, { silent: true });
    return unwrapPayload(data);
}

/**
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function confirmLecture(id) {
    const { data } = await apiClient.post(`/lectures/${id}/confirm`, {}, { silent: true });
    return unwrapPayload(data).lecture;
}

/**
 * @param {number} id
 * @param {object} body
 * @returns {Promise<object>}
 */
export async function updateLecture(id, body) {
    const { data } = await apiClient.put(`/lectures/${id}`, body, { silent: true });
    return unwrapPayload(data).lecture;
}

/**
 * @param {number} id
 */
export async function deleteLecture(id) {
    await apiClient.delete(`/lectures/${id}`, { silent: true });
}

/**
 * @param {number} id
 * @returns {Promise<{ url: string, expires_in: number, type: string, title: string, original_name: string, mime_type: string }>}
 */
export async function getLectureUrl(id) {
    const { data } = await apiClient.get(`/lectures/${id}/url`, { silent: true });
    return unwrapPayload(data);
}
