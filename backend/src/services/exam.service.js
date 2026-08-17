import * as examModel from '../models/exam-session.model.js';
import * as quizModel from '../models/quiz.model.js';
import * as userModel from '../models/user.model.js';
import { generateExamSets } from './exam-set-generator.service.js';
import {
    EXAM_SESSION_STATUS,
    EXAM_SESSION_TYPES
} from '../config/constants.js';

function err(message, status = 400) {
    const e = new Error(message);
    e.status = status;
    return e;
}

/**
 * @param {object} session
 * @returns {number}
 */
function getBufferMinutes() {
    return quizModel.getQuizSettings().examTimeBufferMinutes;
}

/**
 * @param {object} session
 * @returns {{ canStart: boolean, reason?: string, minutesRemaining?: number }}
 */
export function evaluateStartReadiness(session) {
    const opensAt = new Date(session.opens_at);
    const closesAt = new Date(session.closes_at);
    const now = new Date();
    const minutesRemaining = (closesAt.getTime() - now.getTime()) / (60 * 1000);

    if (now < opensAt) {
        return { canStart: false, reason: 'Đợt kiểm tra chưa mở.', minutesRemaining };
    }

    if (minutesRemaining <= 0) {
        return { canStart: false, reason: 'Đợt kiểm tra đã kết thúc.', minutesRemaining: 0 };
    }

    const required = session.duration_minutes + getBufferMinutes();
    if (minutesRemaining < required) {
        return {
            canStart: false,
            reason: 'Đợt sắp đóng, không đủ thời gian làm bài.',
            minutesRemaining
        };
    }

    return { canStart: true, minutesRemaining };
}

/**
 * @param {object} session
 * @returns {number[]}
 */
function getPoolForSession(session) {
    if (session.type === EXAM_SESSION_TYPES.MIXED) {
        return quizModel.getQuestionPoolIds();
    }
    if (!session.topic_id) {
        throw err('Đợt kiểm tra theo lĩnh vực thiếu topic_id.');
    }
    return quizModel.getQuestionPoolIds(session.topic_id);
}

/**
 * @param {number} sessionId
 * @param {number} adminId
 */
function regenerateAssignments(sessionId, adminId) {
    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    if (session.status === EXAM_SESSION_STATUS.OPEN) {
        throw err('Không thể tái tạo đề khi đợt đang mở.');
    }

    const pool = getPoolForSession(session);
    const generated = generateExamSets(
        pool,
        session.questions_per_set,
        session.number_of_sets
    );
    if (!generated.ok) {
        throw err(generated.error);
    }

    const userIds = examModel.findApprovedUserIdsInBattalion(session.battalion_id);
    if (!userIds.length) {
        throw err('Tiểu đoàn không có user đã duyệt để gán bộ đề.');
    }

    examModel.deleteAssignmentsForSession(sessionId);
    const sets = generated.sets;
    userIds.forEach((userId, index) => {
        const set = sets[index % sets.length];
        examModel.createAssignment(sessionId, userId, set);
    });

    examModel.updateSession(sessionId, { needsRegeneration: false });
    return examModel.findById(sessionId);
}

export function regenerateSessionAssignments(sessionId) {
    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    regenerateAssignments(sessionId, session.created_by);
    return examModel.toPublicSession(examModel.findById(sessionId));
}

/**
 * @returns {object[]}
 */
export function listSessionsAdmin() {
    return examModel.findAll().map(examModel.toPublicSession);
}

/**
 * @param {object} data
 * @param {number} adminId
 */
export function createSession(data, adminId) {
    validateSessionPayload(data);
    const row = examModel.createSession({
        battalionId: data.battalionId,
        type: data.type,
        topicId: data.type === EXAM_SESSION_TYPES.TOPIC ? data.topicId : null,
        questionsPerSet: data.questionsPerSet,
        numberOfSets: data.numberOfSets,
        durationMinutes: data.durationMinutes,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        createdBy: adminId
    });
    return examModel.toPublicSession(row);
}

/**
 * @param {number} id
 * @param {object} data
 */
export function updateSession(id, data) {
    const session = examModel.findById(id);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    if (session.status !== EXAM_SESSION_STATUS.DRAFT) {
        throw err('Chỉ sửa đợt ở trạng thái draft.');
    }

    validateSessionPayload({ ...examModel.toPublicSession(session), ...data }, true);
    const fields = {};
    if (data.battalionId !== undefined) fields.battalionId = data.battalionId;
    if (data.type !== undefined) fields.type = data.type;
    if (data.topicId !== undefined) fields.topicId = data.topicId;
    if (data.questionsPerSet !== undefined) fields.questionsPerSet = data.questionsPerSet;
    if (data.numberOfSets !== undefined) fields.numberOfSets = data.numberOfSets;
    if (data.durationMinutes !== undefined) fields.durationMinutes = data.durationMinutes;
    if (data.opensAt !== undefined) fields.opensAt = data.opensAt;
    if (data.closesAt !== undefined) fields.closesAt = data.closesAt;

    if (fields.type === EXAM_SESSION_TYPES.MIXED) {
        fields.topicId = null;
    }

    const updated = examModel.updateSession(id, fields);
    return examModel.toPublicSession(updated);
}

/**
 * @param {number} id
 * @param {boolean} [confirmRegenerate]
 */
export function openSession(id, confirmRegenerate = false) {
    const session = examModel.findById(id);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    if (session.status === EXAM_SESSION_STATUS.OPEN) {
        throw err('Đợt đã được mở.');
    }
    if (session.needs_regeneration && !confirmRegenerate) {
        throw err('Đợt cần tái tạo bộ đề trước khi mở. Gửi confirmRegenerate=true.', 409);
    }

    regenerateAssignments(id, session.created_by);
    const updated = examModel.updateSession(id, { status: EXAM_SESSION_STATUS.OPEN });
    return examModel.toPublicSession(updated);
}

/**
 * @param {number} id
 */
export function closeSession(id) {
    const session = examModel.findById(id);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    const updated = examModel.updateSession(id, { status: EXAM_SESSION_STATUS.CLOSED });
    return examModel.toPublicSession(updated);
}

/**
 * @param {number} userId
 */
export function getOpenSessionsForUser(userId) {
    const user = userModel.findById(userId);
    if (!user?.battalion_id) return [];

    return examModel
        .findOpenForBattalion(user.battalion_id)
        .map(row => {
            const pub = examModel.toUserSession(row);
            const readiness = evaluateStartReadiness(row);
            return { ...pub, canStart: readiness.canStart, startBlockedReason: readiness.reason ?? null };
        });
}

/**
 * @param {number} sessionId
 * @param {number} userId
 */
export function getSessionReadiness(sessionId, userId) {
    const session = assertUserSessionAccess(sessionId, userId);
    const readiness = evaluateStartReadiness(session);
    const assignment = examModel.findAssignment(sessionId, userId);
    return {
        session: examModel.toUserSession(session),
        canStart: readiness.canStart && assignment?.status !== 'completed',
        reason: readiness.reason ?? null,
        minutesRemaining: readiness.minutesRemaining,
        alreadyCompleted: assignment?.status === 'completed'
    };
}

/**
 * @param {number} sessionId
 * @param {number} userId
 */
export function startSessionForUser(sessionId, userId) {
    const session = assertUserSessionAccess(sessionId, userId);
    if (session.status !== EXAM_SESSION_STATUS.OPEN) {
        throw err('Đợt kiểm tra không đang mở.');
    }

    const readiness = evaluateStartReadiness(session);
    if (!readiness.canStart) {
        throw err(readiness.reason || 'Không thể bắt đầu làm bài.');
    }

    const assignment = examModel.findAssignment(sessionId, userId);
    if (!assignment) {
        throw err('Bạn không được gán bộ đề trong đợt này.');
    }
    if (assignment.status === 'completed') {
        throw err('Bạn đã hoàn thành đợt kiểm tra này.');
    }

    let questionSet;
    try {
        questionSet = JSON.parse(assignment.question_set);
    } catch {
        throw err('Bộ đề được gán không hợp lệ.');
    }

    const questions = quizModel.getQuestionsByDbIds(questionSet);
    if (!questions.length) {
        throw err('Không tải được câu hỏi từ bộ đề.');
    }

    if (assignment.status === 'assigned') {
        examModel.updateAssignment(assignment.id, {
            status: 'in_progress',
            startedAt: new Date().toISOString()
        });
    }

    const title =
        session.type === EXAM_SESSION_TYPES.MIXED
            ? 'Kiểm tra — Trộn tổng hợp'
            : `Kiểm tra — ${session.topic_title || 'Lĩnh vực'}`;

    return {
        session: examModel.toUserSession(session),
        assignmentId: assignment.id,
        title,
        questions,
        closesAt: session.closes_at,
        durationMinutes: session.duration_minutes
    };
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @param {object} body
 */
export function submitSessionForUser(sessionId, userId, body) {
    const session = assertUserSessionAccess(sessionId, userId);
    const assignment = examModel.findAssignment(sessionId, userId);
    if (!assignment) throw err('Không tìm thấy bộ đề được gán.', 404);
    if (assignment.status === 'completed') {
        throw err('Bài kiểm tra đã được nộp.');
    }

    const existing = examModel.findResult(sessionId, userId);
    if (existing) throw err('Kết quả đã được lưu.');

    const score = Number(body.score);
    const total = parseInt(body.total, 10);
    const durationSec = parseInt(body.durationSec, 10) || 0;

    examModel.createResult({
        assignmentId: assignment.id,
        userId,
        sessionId,
        score,
        total,
        durationSec,
        detail: body.detail
    });

    examModel.updateAssignment(assignment.id, {
        status: 'completed',
        completedAt: new Date().toISOString()
    });

    return { ok: true };
}

/**
 * @param {number} topicId
 */
export function markSessionsNeedRegeneration(topicId) {
    examModel.markNeedsRegenerationForTopic(topicId);
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @returns {object}
 */
function assertUserSessionAccess(sessionId, userId) {
    const user = userModel.findById(userId);
    if (!user?.battalion_id) throw err('Tài khoản chưa được gán tiểu đoàn.', 403);

    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    if (session.battalion_id !== user.battalion_id) {
        throw err('Đợt kiểm tra không thuộc tiểu đoàn của bạn.', 403);
    }
    return session;
}

/**
 * @param {object} data
 * @param {boolean} [partial]
 */
function validateSessionPayload(data, partial = false) {
    const battalionId = Number(data.battalionId);
    const questionsPerSet = Number(data.questionsPerSet);
    const numberOfSets = Number(data.numberOfSets);
    const durationMinutes = Number(data.durationMinutes);

    if (!partial || data.battalionId !== undefined) {
        if (!battalionId) throw err('Vui lòng chọn tiểu đoàn.');
    }
    if (!partial || data.type !== undefined) {
        if (![EXAM_SESSION_TYPES.TOPIC, EXAM_SESSION_TYPES.MIXED].includes(data.type)) {
            throw err('Loại đợt kiểm tra không hợp lệ.');
        }
    }
    if (data.type === EXAM_SESSION_TYPES.TOPIC && !Number(data.topicId)) {
        throw err('Vui lòng chọn lĩnh vực cho đợt kiểm tra.');
    }
    if (!partial || data.questionsPerSet !== undefined) {
        if (!questionsPerSet || questionsPerSet < 1) throw err('Số câu/bộ phải là số nguyên dương.');
    }
    if (!partial || data.numberOfSets !== undefined) {
        if (!numberOfSets || numberOfSets < 1) throw err('Số bộ phải là số nguyên dương.');
    }
    if (!partial || data.durationMinutes !== undefined) {
        if (!durationMinutes || durationMinutes < 1) throw err('Thời gian làm bài phải là số nguyên dương.');
    }
    if (!partial || data.opensAt !== undefined) {
        if (!data.opensAt) throw err('Thiếu thời gian mở đợt.');
    }
    if (!partial || data.closesAt !== undefined) {
        if (!data.closesAt) throw err('Thiếu thời gian đóng đợt.');
    }
    if (data.opensAt && data.closesAt && new Date(data.closesAt) <= new Date(data.opensAt)) {
        throw err('Thời gian đóng phải sau thời gian mở.');
    }
}
