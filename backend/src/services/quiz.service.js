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
export function saveWrongHistory(userId, body) {
    return wrongModel.saveHistory(
        userId,
        body.wrongHistory || {},
        body.correctHistory || {}
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
