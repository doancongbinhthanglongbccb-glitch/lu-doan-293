import * as quizModel from '../models/quiz.model.js';
import * as wrongModel from '../models/wrong-answer.model.js';
import * as historyModel from '../models/quiz-history.model.js';
import * as examService from './exam.service.js';
import * as practiceMixedService from './practice-mixed.service.js';

export function getQuiz() {
    return quizModel.getQuizData();
}

export function getQuizOutline() {
    return quizModel.getQuizOutline();
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
    const saved = quizModel.replaceQuizData(data);
    practiceMixedService.regenerateSets();
    return saved;
}

/**
 * @param {{ practiceMixedQuestionCount: number }} data
 */
export function updateQuizSettings(data) {
    const before = quizModel.getQuizSettings();
    const settings = quizModel.updateQuizSettings(data);
    const countsChanged =
        settings.practiceMixedQuestionCount !== before.practiceMixedQuestionCount ||
        settings.practiceMixedSetCount !== before.practiceMixedSetCount;
    if (countsChanged) {
        practiceMixedService.regenerateSets();
    }
    return settings;
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

function shuffleList(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Câu ôn sai của chính user — không nhận userId/hash từ client.
 * @param {number} userId
 * @param {{ topicIds?: unknown, minWrongCount?: unknown, count?: unknown }} body
 */
export function getWrongReview(userId, body = {}) {
    const minWrongCount = Math.max(1, parseInt(body.minWrongCount, 10) || 1);
    const count = Math.max(1, parseInt(body.count, 10) || 20);
    const topicIds = Array.isArray(body.topicIds)
        ? body.topicIds.map(Number).filter(n => Number.isInteger(n) && n > 0)
        : [];

    const { wrongHistory } = wrongModel.getHistory(userId);
    const hashes = Object.entries(wrongHistory)
        .filter(([, n]) => Number(n) >= minWrongCount)
        .map(([hash]) => hash);

    const meta = quizModel.getQuizOutline();
    if (!hashes.length) {
        return { title: meta.title, questions: [] };
    }

    let questions = quizModel.getQuestionsByHashes(hashes);
    if (topicIds.length) {
        const allowed = new Set(topicIds);
        questions = questions.filter(q => allowed.has(Number(q.topicId)));
    }

    questions = shuffleList(questions).slice(0, count);
    return { title: meta.title, questions };
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

    const result = quizModel.importQuestionsToTopic(topicId, questions);
    examService.markSessionsNeedRegeneration(topicId);
    practiceMixedService.regenerateSets();
    return result;
}
