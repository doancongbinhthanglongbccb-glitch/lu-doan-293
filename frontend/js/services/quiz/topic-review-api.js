import { apiClient } from '../api/api-client.js';
import { unwrapPayload } from '../api/api-response.js';

export async function loadSets(topicId) {
    const { data } = await apiClient.get(`/quiz/topic-review/${topicId}/sets`, { silent: true });
    return unwrapPayload(data);
}

export async function loadSet(topicId, setIndex) {
    const { data } = await apiClient.get(`/quiz/topic-review/${topicId}/sets/${setIndex}`, {
        silent: true
    });
    return unwrapPayload(data);
}

export async function recordProgress(topicId, setIndex, questionId) {
    const { data } = await apiClient.post(
        `/quiz/topic-review/${topicId}/sets/${setIndex}/progress`,
        { questionId },
        { silent: true }
    );
    return unwrapPayload(data).progress;
}
