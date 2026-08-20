import * as examModel from '../models/exam-session.model.js';
import * as quizModel from '../models/quiz.model.js';
import * as wrongModel from '../models/wrong-answer.model.js';
import { stripCorrectFlags, gradeQuestion } from '../utils/question-payload.js';
import * as userModel from '../models/user.model.js';
import * as battalionModel from '../models/battalion.model.js';
import { generateExamSets } from './exam-set-generator.service.js';
import {
    EXAM_SESSION_STATUS,
    EXAM_SESSION_TYPES,
    USER_STATUS
} from '../config/constants.js';

export { stripCorrectFlags };

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
        return { canStart: false, reason: 'Chưa đến thời gian làm bài', minutesRemaining };
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
 * Thời gian còn lại (phút) khi resume in_progress — không reset duration.
 * @param {object} session
 * @param {object} assignment
 * @returns {number}
 */
function computeRemainingDurationMinutes(session, assignment) {
    const startedAt = assignment?.started_at;
    if (!startedAt) return session.duration_minutes;
    const now = Date.now();
    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) return session.duration_minutes;
    const durationMs = Number(session.duration_minutes) * 60 * 1000;
    const closeMs = new Date(session.closes_at).getTime();
    const remainingMs = Math.min(started + durationMs, closeMs) - now;
    return Math.max(0, remainingMs / 60000);
}

function assertSubmitWithinTime(session, assignment) {
    const now = Date.now();
    const closesAt = new Date(session.closes_at).getTime();
    if (Number.isFinite(closesAt) && now > closesAt) {
        throw err('Đợt kiểm tra đã kết thúc, không thể nộp bài.', 403);
    }
    if (!assignment?.started_at) return;
    const started = new Date(assignment.started_at).getTime();
    if (!Number.isFinite(started)) return;
    const durationMs = Number(session.duration_minutes) * 60 * 1000;
    const bufferMs = getBufferMinutes() * 60 * 1000;
    if (now > started + durationMs + bufferMs) {
        throw err('Đã hết thời gian làm bài, không thể nộp bài.', 403);
    }
}

function parseQuestionIds(raw) {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(Number).filter(n => n > 0) : [];
    } catch {
        return [];
    }
}

/**
 * Generate N sets per topic (or one mixed pool). Does not assign users.
 * @param {number} sessionId
 */
function regenerateSessionSets(sessionId) {
    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    if (session.status === EXAM_SESSION_STATUS.OPEN) {
        throw err('Không thể tái tạo đề khi đợt đang mở.');
    }

    const perSet = session.questions_per_set;
    const numberOfSets = session.number_of_sets;
    const created = [];

    examModel.deleteAssignmentsForSession(sessionId);
    examModel.deleteSetsForSession(sessionId);

    const mixed = generateExamSets(quizModel.getQuestionPoolIds(), perSet, numberOfSets);
    if (mixed.ok && mixed.sets.length) {
        mixed.sets.forEach((ids, index) => {
            examModel.insertSessionSet(sessionId, null, index + 1, ids);
            created.push(ids);
        });
    }

    quizModel.getTopicsWithQuestions().forEach(topic => {
        const pool = quizModel.getQuestionPoolIds(topic.id);
        const generated = generateExamSets(pool, perSet, numberOfSets);
        if (!generated.ok || !generated.sets.length) return;
        generated.sets.forEach((ids, index) => {
            examModel.insertSessionSet(sessionId, topic.id, index + 1, ids);
            created.push(ids);
        });
    });

    if (!created.length) {
        throw err('Không có câu hỏi để tạo bộ đề.');
    }

    examModel.updateSession(sessionId, { needsRegeneration: false });
    return examModel.findById(sessionId);
}

export function regenerateSessionAssignments(sessionId) {
    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    regenerateSessionSets(sessionId);
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
    const battalionIds = parseBattalionIds(data);
    const row = examModel.createSession({
        battalionIds,
        type: data.type,
        topicId: null,
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
    if (data.battalionIds !== undefined || data.battalionId !== undefined) {
        fields.battalionIds = parseBattalionIds({ ...examModel.toPublicSession(session), ...data });
    }
    if (data.type !== undefined) fields.type = data.type;
    if (data.questionsPerSet !== undefined) fields.questionsPerSet = data.questionsPerSet;
    if (data.numberOfSets !== undefined) fields.numberOfSets = data.numberOfSets;
    if (data.durationMinutes !== undefined) fields.durationMinutes = data.durationMinutes;
    if (data.opensAt !== undefined) fields.opensAt = data.opensAt;
    if (data.closesAt !== undefined) fields.closesAt = data.closesAt;

    if (fields.type === EXAM_SESSION_TYPES.MIXED || fields.type === EXAM_SESSION_TYPES.TOPIC) {
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

    const battalionIds = (session.battalions || []).map(b => b.id);
    const conflicts = examModel.findOpenConflicts(battalionIds, id);
    if (conflicts.length) {
        const names = [...new Set(conflicts.map(c => c.battalion_name))].join(', ');
        throw err(`Tiểu đoàn đang có đợt kiểm tra mở: ${names}.`);
    }

    regenerateSessionSets(id);
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
export function getSessionReadiness(sessionId, userId, topicId) {
    const session = assertUserSessionAccess(sessionId, userId);
    const readiness = evaluateStartReadiness(session);
    const resolvedTopicId = topicId != null && topicId !== '' ? Number(topicId) : null;
    const assignment = examModel.findAssignment(sessionId, userId, resolvedTopicId);
    return {
        session: examModel.toUserSession(session),
        canStart: readiness.canStart && assignment?.status !== 'completed',
        reason: readiness.reason ?? null,
        minutesRemaining: readiness.minutesRemaining,
        alreadyCompleted: assignment?.status === 'completed'
    };
}

export function listSessionTopicsForUser(sessionId, userId) {
    assertUserSessionAccess(sessionId, userId);
    return examModel.findTopicsForSession(sessionId);
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @param {number|null|undefined} topicId  null = nhánh trộn, number = lĩnh vực
 */
export function listSetsForUser(sessionId, userId, topicId) {
    assertUserSessionAccess(sessionId, userId);
    const rows = examModel.findSetsForSession(sessionId, topicId === undefined ? null : topicId);
    return rows.map(row => ({
        id: row.id,
        setIndex: row.set_index,
        questionCount: parseQuestionIds(row.question_ids).length
    }));
}

export function listBranchesForUser(sessionId, userId) {
    assertUserSessionAccess(sessionId, userId);
    const mixed = examModel.findSetsForSession(sessionId, null);
    const topics = examModel.findTopicsForSession(sessionId);
    return {
        hasMixed: mixed.length > 0,
        hasTopic: topics.length > 0,
        mixedSetCount: mixed.length,
        topics
    };
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @param {{ topicId?: number }} [body]
 */
export function startSessionForUser(sessionId, userId, body = {}) {
    const session = assertUserSessionAccess(sessionId, userId);
    const user = userModel.findById(userId);
    if (user.status !== USER_STATUS.APPROVED) {
        throw err('Tài khoản chưa được duyệt.', 403);
    }
    if (session.status !== EXAM_SESSION_STATUS.OPEN) {
        throw err('Đợt kiểm tra không đang mở.');
    }

    const sessionSetId = Number(body.sessionSetId) || null;
    if (!sessionSetId) throw err('Vui lòng chọn bộ đề.');

    const setRow = examModel.findSetById(sessionSetId);
    if (!setRow || Number(setRow.session_id) !== Number(sessionId)) {
        throw err('Bộ đề không thuộc đợt này.', 404);
    }

    const topicId = setRow.topic_id == null ? null : Number(setRow.topic_id);

    let assignment = examModel.findAssignment(sessionId, userId, topicId);
    if (assignment?.status === 'completed') {
        throw err('Bạn đã hoàn thành phần kiểm tra này.');
    }

    const isResume = assignment?.status === 'in_progress';
    if (!isResume) {
        const readiness = evaluateStartReadiness(session);
        if (!readiness.canStart) {
            throw err(readiness.reason || 'Không thể bắt đầu làm bài.');
        }
    }

    if (!assignment) {
        const questionSet = parseQuestionIds(setRow.question_ids);
        if (!questionSet.length) throw err('Bộ đề trống.');
        examModel.createAssignment({
            sessionId,
            userId,
            topicId,
            sessionSetId: setRow.id,
            questionSet
        });
        assignment = examModel.findAssignment(sessionId, userId, topicId);
    }

    let questionSet;
    try {
        questionSet = JSON.parse(assignment.question_set);
    } catch {
        throw err('Bộ đề được gán không hợp lệ.');
    }

    const questions = stripCorrectFlags(quizModel.getQuestionsByDbIds(questionSet));
    if (!questions.length) {
        throw err('Không tải được câu hỏi từ bộ đề.');
    }

    if (assignment.status === 'assigned') {
        examModel.updateAssignment(assignment.id, {
            status: 'in_progress',
            startedAt: new Date().toISOString()
        });
        assignment = examModel.findAssignment(sessionId, userId, topicId);
    }

    const durationMinutes = isResume
        ? computeRemainingDurationMinutes(session, assignment)
        : session.duration_minutes;

    const title = 'Kiểm tra';

    return {
        session: examModel.toUserSession(session),
        assignmentId: assignment.id,
        topicId,
        title,
        questions,
        closesAt: session.closes_at,
        durationMinutes
    };
}

export function submitSessionForUser(sessionId, userId, body) {
    const session = assertUserSessionAccess(sessionId, userId);
    const topicId = body.topicId != null && body.topicId !== '' ? Number(body.topicId) : null;
    const assignment = examModel.findAssignment(sessionId, userId, topicId);
    if (!assignment) throw err('Không tìm thấy bộ đề được gán.', 404);
    if (assignment.status === 'completed') {
        throw err('Bài kiểm tra đã được nộp.');
    }

    if (examModel.findResultByAssignment(assignment.id)) {
        throw err('Kết quả đã được lưu.');
    }

    assertSubmitWithinTime(session, assignment);

    let questionSet;
    try {
        questionSet = JSON.parse(assignment.question_set);
    } catch {
        throw err('Bộ đề được gán không hợp lệ.');
    }
    const questions = quizModel.getQuestionsByDbIds(questionSet);
    const answerList = Array.isArray(body.answers) ? body.answers : [];
    const byId = new Map(
        answerList.map(a => [Number(a.questionId || a.dbId), a])
    );

    let correct = 0;
    let answered = 0;
    questions.forEach(q => {
        const grade = gradeQuestion(q, byId.get(q.dbId) || null);
        if (grade.answered) answered += 1;
        if (grade.isCorrect) correct += 1;
        wrongModel.recordAnswerResult(userId, q.hash, grade.isCorrect);
    });
    const total = questions.length || 1;
    const score = Math.round((correct / total) * 100) / 10;
    const durationSec = parseInt(body.durationSec, 10) || 0;

    examModel.createResult({
        assignmentId: assignment.id,
        userId,
        sessionId,
        score,
        total,
        durationSec,
        detail: {
            ...(body.detail && typeof body.detail === 'object' ? body.detail : {}),
            correct,
            wrong: answered - correct,
            unanswered: total - answered,
            gradedServerSide: true
        }
    });

    examModel.updateAssignment(assignment.id, {
        status: 'completed',
        completedAt: new Date().toISOString()
    });

    const payload = { ok: true, score, total, correct };
    if (session.status === EXAM_SESSION_STATUS.CLOSED) {
        payload.questions = questions;
    }
    return payload;
}

/**
 * @param {number} topicId
 */
export function markSessionsNeedRegeneration(topicId) {
    examModel.markNeedsRegenerationForTopic(topicId);
}

export function listCheckHistoryForUser(userId, options) {
    return examModel.listResultsForUser(userId, options);
}

export function listCheckHistoryAdmin(options) {
    return examModel.listResultsAdmin(options);
}

export function getProgressMatrix(sessionId) {
    const session = examModel.findById(sessionId);
    if (!session) throw err('Không tìm thấy đợt kiểm tra.', 404);
    const matrix = examModel.getProgressMatrix(sessionId);
    return {
        session: examModel.toPublicSession(session),
        ...matrix
    };
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
    if (!examModel.sessionHasBattalion(sessionId, user.battalion_id)) {
        throw err('Đợt kiểm tra không thuộc tiểu đoàn của bạn.', 403);
    }
    return session;
}

function parseBattalionIds(data) {
    const raw = Array.isArray(data.battalionIds)
        ? data.battalionIds
        : data.battalionId != null
          ? [data.battalionId]
          : [];
    const ids = [...new Set(raw.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
    return ids;
}

/**
 * @param {object} data
 * @param {boolean} [partial]
 */
function validateSessionPayload(data, partial = false) {
    const questionsPerSet = Number(data.questionsPerSet);
    const numberOfSets = Number(data.numberOfSets);
    const durationMinutes = Number(data.durationMinutes);

    if (!partial || data.battalionIds !== undefined || data.battalionId !== undefined) {
        const battalionIds = parseBattalionIds(data);
        if (!battalionIds.length) throw err('Vui lòng chọn ít nhất một tiểu đoàn.');
        for (const id of battalionIds) {
            if (!battalionModel.findById(id)) throw err('Tiểu đoàn không hợp lệ.');
        }
    }
    if (!partial || data.type !== undefined) {
        if (![EXAM_SESSION_TYPES.TOPIC, EXAM_SESSION_TYPES.MIXED].includes(data.type)) {
            throw err('Loại đợt kiểm tra không hợp lệ.');
        }
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
