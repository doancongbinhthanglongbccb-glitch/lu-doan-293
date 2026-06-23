import * as quizModel from '../models/quiz.model.js';
import * as wrongModel from '../models/wrong-answer.model.js';
import * as historyModel from '../models/quiz-history.model.js';

export function getQuiz() {
    return quizModel.getQuizData();
}

/**
 * @param {object} data
 */
export function saveQuiz(data) {
    if (!data || typeof data !== 'object') {
        const err = new Error('Dữ liệu quiz không hợp lệ.');
        err.status = 400;
        throw err;
    }
    if (!Array.isArray(data.topics)) {
        const err = new Error('Thiếu danh sách chủ đề (topics).');
        err.status = 400;
        throw err;
    }
    return quizModel.replaceQuizData(data);
}

/**
 * @param {number} userId
 */
export function getWrongHistory(userId) {
    return wrongModel.getHistory(userId);
}

/**
 * @param {number} userId
 * @param {object} body
 */
/**
 * Sanitize client history maps — only string keys, non-negative integers.
 * @param {Record<string, unknown>} map
 * @returns {Record<string, number>}
 */
function sanitizeHistoryMap(map) {
    if (!map || typeof map !== 'object') return {};
    const out = {};
    for (const [key, value] of Object.entries(map)) {
        if (typeof key !== 'string' || !key.trim()) continue;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) continue;
        out[key] = Math.floor(n);
    }
    return out;
}

export function saveWrongHistory(userId, body) {
    return wrongModel.saveHistory(
        userId,
        sanitizeHistoryMap(body.wrongHistory),
        sanitizeHistoryMap(body.correctHistory)
    );
}

/**
 * @param {number} userId
 * @param {number} [limit]
 */
export function getQuizHistory(userId, limit) {
    return historyModel.listByUser(userId, limit);
}

/**
 * @param {object} [options]
 */
export function getAllQuizHistory(options) {
    return historyModel.listAll(options);
}

/**
 * @param {number} userId
 * @param {object} body
 */
export function saveQuizHistory(userId, body) {
    const mode = String(body.mode || '').trim();
    if (!mode) {
        const err = new Error('Thiếu chế độ làm bài.');
        err.status = 400;
        throw err;
    }

    const total = Number(body.total);
    if (!Number.isFinite(total) || total < 1) {
        const err = new Error('Tổng số câu không hợp lệ.');
        err.status = 400;
        throw err;
    }

    const score = body.score != null ? Number(body.score) : null;
    if (score != null && (!Number.isFinite(score) || score < 0)) {
        const err = new Error('Điểm không hợp lệ.');
        err.status = 400;
        throw err;
    }
    if (score != null && score > total) {
        const err = new Error('Điểm không được lớn hơn tổng số câu.');
        err.status = 400;
        throw err;
    }

    const durationSec =
        body.durationSec != null ? Math.max(0, Math.round(Number(body.durationSec))) : null;

    return historyModel.insertRecord(userId, {
        mode,
        score,
        total,
        durationSec,
        detail: body.detail ?? null
    });
}

/**
 * Import câu hỏi vào một topic cụ thể (không xóa các topic khác)
 * @param {number} topicId 
 * @param {Array} questions 
 */
export function importQuestionsToTopic(topicId, questions) {
    if (!topicId || !Array.isArray(questions)) {
        const err = new Error('Thiếu topicId hoặc questions không phải mảng');
        err.status = 400;
        throw err;
    }

    return quizModel.importQuestionsToTopic(topicId, questions);
}
