import * as quizModel from '../models/quiz.model.js';
import * as wrongModel from '../models/wrong-answer.model.js';

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
