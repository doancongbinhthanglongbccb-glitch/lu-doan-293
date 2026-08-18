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
        const topicId = req.query.topicId ? parseInt(req.query.topicId, 10) : undefined;
        const readiness = examService.getSessionReadiness(sessionId, req.user.id, topicId);
        sendSuccess(res, readiness);
    } catch (err) {
        next(err);
    }
}

export function listSessionTopics(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const topics = examService.listSessionTopicsForUser(sessionId, req.user.id);
        sendSuccess(res, { topics });
    } catch (err) {
        next(err);
    }
}

export function listSessionBranches(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const branches = examService.listBranchesForUser(sessionId, req.user.id);
        sendSuccess(res, branches);
    } catch (err) {
        next(err);
    }
}

export function listSessionSets(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const topicId =
            req.query.topicId != null && req.query.topicId !== ''
                ? parseInt(req.query.topicId, 10)
                : null;
        const sets = examService.listSetsForUser(sessionId, req.user.id, topicId);
        sendSuccess(res, { sets });
    } catch (err) {
        next(err);
    }
}

export function startSession(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const payload = examService.startSessionForUser(sessionId, req.user.id, req.body);
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

export function listMyCheckHistory(req, res, next) {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const branch =
            req.query.branch === 'mixed' || req.query.branch === 'topic' ? req.query.branch : '';
        const records = examService.listCheckHistoryForUser(req.user.id, { limit, branch });
        sendSuccess(res, { records });
    } catch (err) {
        next(err);
    }
}

export function listCheckHistoryAdmin(req, res, next) {
    try {
        const battalionId = req.query.battalionId ? parseInt(req.query.battalionId, 10) : null;
        const branch = req.query.branch === 'mixed' || req.query.branch === 'topic' ? req.query.branch : '';
        const search = req.query.search || '';
        const limit = parseInt(req.query.limit, 10) || 200;
        const records = examService.listCheckHistoryAdmin({
            battalionId: Number.isInteger(battalionId) && battalionId > 0 ? battalionId : null,
            branch,
            search,
            limit
        });
        sendSuccess(res, { records });
    } catch (err) {
        next(err);
    }
}

export function getProgressMatrix(req, res, next) {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const matrix = examService.getProgressMatrix(sessionId);
        sendSuccess(res, matrix);
    } catch (err) {
        next(err);
    }
}
