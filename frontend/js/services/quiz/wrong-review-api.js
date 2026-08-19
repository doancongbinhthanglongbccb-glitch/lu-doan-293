import { apiClient } from '../api/api-client.js';
import { unwrapPayload } from '../api/api-response.js';

/**
 * @param {{ topicIds?: number[], minWrongCount: number, count: number }} body
 */
export async function loadWrongReview(body) {
    const { data } = await apiClient.post('/quiz/wrong-review', body, { silent: true });
    return unwrapPayload(data);
}
