import * as quizService from '../services/quiz.service.js';
import { sendSuccess } from '../utils/response.js';

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
        const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : 50;
        const records = quizService.getQuizHistory(req.user.id, limit);
        sendSuccess(res, { records });
    } catch (err) {
        next(err);
    }
}

export function getAllQuizHistory(req, res, next) {
    try {
        const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : 100;
        const search = req.query.search || '';
        const records = quizService.getAllQuizHistory({ limit, search });
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
