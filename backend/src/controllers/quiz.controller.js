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
