import * as examService from '../services/exam.service.js';
import { sendSuccess } from '../utils/response.js';

export function listSessionsAdmin(req, res, next) {
    try {
        const sessions = examService.listSessionsAdmin();
        sendSuccess(res, { sessions });
    } catch (err) {
        next(err);
    }
}

export function createSession(req, res, next) {
    try {
        const session = examService.createSession(req.body, req.user.id);
        sendSuccess(res, { session }, 'Đã tạo đợt kiểm tra.', 201);
    } catch (err) {
        next(err);
    }
}

export function updateSession(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const session = examService.updateSession(id, req.body);
        sendSuccess(res, { session }, 'Đã cập nhật đợt kiểm tra.');
    } catch (err) {
        next(err);
    }
}

export function openSession(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const session = examService.openSession(id, Boolean(req.body.confirmRegenerate));
        sendSuccess(res, { session }, 'Đã mở đợt kiểm tra.');
    } catch (err) {
        next(err);
    }
}

export function closeSession(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const session = examService.closeSession(id);
        sendSuccess(res, { session }, 'Đã đóng đợt kiểm tra.');
    } catch (err) {
        next(err);
    }
}

export function regenerateSession(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const session = examService.regenerateSessionAssignments(id);
        sendSuccess(res, { session }, 'Đã tái tạo bộ đề.');
    } catch (err) {
        next(err);
    }
}

export function listOpenSessions(req, res, next) {
    try {
        const sessions = examService.getOpenSessionsForUser(req.user.id);
        sendSuccess(res, { sessions });
    } catch (err) {
        next(err);
    }
}

export function getReadiness(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const readiness = examService.getSessionReadiness(sessionId, req.user.id);
        sendSuccess(res, readiness);
    } catch (err) {
        next(err);
    }
}

export function startSession(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const payload = examService.startSessionForUser(sessionId, req.user.id);
        sendSuccess(res, payload);
    } catch (err) {
        next(err);
    }
}

export function submitSession(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        examService.submitSessionForUser(sessionId, req.user.id, req.body);
        sendSuccess(res, null, 'Đã nộp bài kiểm tra.');
    } catch (err) {
        next(err);
    }
}
