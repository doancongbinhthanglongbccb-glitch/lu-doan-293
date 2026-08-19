import { apiClient } from '../api/api-client.js';
import { unwrapPayload } from '../api/api-response.js';

/**
 * Chấm 1 câu ôn tập ở server — không nhận isCorrect.
 * @param {{ questionId: number, selected?: number[], textValue?: string }} body
 * @returns {Promise<{ answered: boolean, correct: boolean }>}
 */
export async function grade(body) {
    const { data } = await apiClient.post('/quiz/grade-question', body, { silent: true });
    return unwrapPayload(data);
}
