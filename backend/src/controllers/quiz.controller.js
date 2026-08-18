import * as quizService from '../services/quiz.service.js';
import * as practiceMixedService from '../services/practice-mixed.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * @param {string|undefined} raw
 * @returns {number|null}
 */
function parsePositiveInt(raw) {
    if (raw == null || raw === '' || !/^\d+$/.test(String(raw))) return null;
    const n = parseInt(String(raw), 10);
    return n > 0 ? n : null;
}

export function getQuiz(req, res, next) {
    try {
        const quiz = quizService.getQuiz();
        sendSuccess(res, quiz);
    } catch (err) {
        next(err);
    }
}

export function putQuiz(req, res, next) {
    try {
        const quiz = quizService.saveQuiz(req.body);
        sendSuccess(res, quiz, 'Đã cập nhật ngân hàng câu hỏi.');
    } catch (err) {
        next(err);
    }
}

export function patchQuizSettings(req, res, next) {
    try {
        const settings = quizService.updateQuizSettings(req.body);
        sendSuccess(res, { settings }, 'Đã cập nhật cài đặt.');
    } catch (err) {
        next(err);
    }
}

export function getWrongHistory(req, res, next) {
    try {
        const history = quizService.getWrongHistory(req.user.id);
        sendSuccess(res, history);
    } catch (err) {
        next(err);
    }
}

export function postWrongHistory(req, res, next) {
    try {
        const history = quizService.saveWrongHistory(req.user.id, req.body);
        sendSuccess(res, history, 'Đã lưu lịch sử câu sai.');
    } catch (err) {
        next(err);
    }
}

export function getQuizHistory(req, res, next) {
    try {
        const limit = parsePositiveInt(req.query.limit) ?? 50;
        const records = quizService.getQuizHistory(req.user.id, limit);
        sendSuccess(res, { records });
    } catch (err) {
        next(err);
    }
}

export function getAllQuizHistory(req, res, next) {
    try {
        const limit = parsePositiveInt(req.query.limit) ?? 100;
        const search = req.query.search || '';
        const battalionId = parsePositiveInt(req.query.battalionId);
        const records = quizService.getAllQuizHistory({ limit, search, battalionId });
        sendSuccess(res, { records });
    } catch (err) {
        next(err);
    }
}

export function postQuizHistory(req, res, next) {
    try {
        const record = quizService.saveQuizHistory(req.user.id, req.body);
        sendSuccess(res, { record }, 'Đã lưu lịch sử thi.', 201);
    } catch (err) {
        next(err);
    }
}

export function importToTopic(req, res, next) {
    try {
        const topicId = parsePositiveInt(req.params.topicId);
        const { questions } = req.body;

        if (!topicId || !Array.isArray(questions) || questions.length === 0) {
            return sendError(res, 'Thiếu topicId hoặc questions không hợp lệ', 400);
        }

        const result = quizService.importQuestionsToTopic(topicId, questions);
        sendSuccess(res, result, `Đã thêm ${result.added} câu hỏi vào topic thành công.`);
    } catch (err) {
        next(err);
    }
}

export function listPracticeMixedSets(req, res, next) {
    try {
        const sets = practiceMixedService.listSetsForUser(req.user.id);
        sendSuccess(res, { sets });
    } catch (err) {
        next(err);
    }
}

export function getPracticeMixedSet(req, res, next) {
    try {
        const setId = parsePositiveInt(req.params.id);
        if (!setId) return sendError(res, 'ID bộ không hợp lệ.', 400);
        const payload = practiceMixedService.getSetQuestions(setId);
        sendSuccess(res, payload);
    } catch (err) {
        next(err);
    }
}

export function postPracticeMixedProgress(req, res, next) {
    try {
        const setId = parsePositiveInt(req.params.id);
        if (!setId) return sendError(res, 'ID bộ không hợp lệ.', 400);
        const ids = Array.isArray(req.body.questionIds)
            ? req.body.questionIds
            : req.body.questionId != null
              ? [req.body.questionId]
              : [];
        const progress = practiceMixedService.recordProgress(req.user.id, setId, ids);
        sendSuccess(res, { progress });
    } catch (err) {
        next(err);
    }
}

export function regeneratePracticeMixedSets(req, res, next) {
    try {
        const result = practiceMixedService.regenerateSets();
        if (!result.ok) {
            return sendError(res, result.error, 400);
        }
        sendSuccess(res, { setCount: result.setCount }, 'Đã tái tạo bộ ôn tập tổng hợp.');
    } catch (err) {
        next(err);
    }
}