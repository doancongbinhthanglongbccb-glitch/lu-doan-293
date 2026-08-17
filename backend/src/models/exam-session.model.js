import { getDb } from '../../database/connection.js';
import { EXAM_SESSION_STATUS } from '../config/constants.js';

/**
 * Admin payload — includes set count and regeneration flags.
 * @param {object} row
 * @returns {object}
 */
export function toPublicSession(row) {
    if (!row) return null;
    return {
        id: row.id,
        battalionId: row.battalion_id,
        battalionName: row.battalion_name ?? null,
        type: row.type,
        topicId: row.topic_id ?? null,
        topicTitle: row.topic_title ?? null,
        questionsPerSet: row.questions_per_set,
        numberOfSets: row.number_of_sets,
        durationMinutes: row.duration_minutes,
        opensAt: row.opens_at,
        closesAt: row.closes_at,
        status: row.status,
        needsRegeneration: !!row.needs_regeneration,
        createdBy: row.created_by,
        createdAt: row.created_at
    };
}

/**
 * Soldier payload — no numberOfSets or other admin-only fields.
 * @param {object} row
 * @returns {object}
 */
export function toUserSession(row) {
    if (!row) return null;
    return {
        id: row.id,
        type: row.type,
        topicId: row.topic_id ?? null,
        topicTitle: row.topic_title ?? null,
        questionsPerSet: row.questions_per_set,
        durationMinutes: row.duration_minutes,
        opensAt: row.opens_at,
        closesAt: row.closes_at
    };
}

/**
 * @param {object} row
 * @returns {object}
 */
export function toPublicAssignment(row) {
    if (!row) return null;
    let questionSet = [];
    try {
        questionSet = JSON.parse(row.question_set);
    } catch {
        questionSet = [];
    }
    return {
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        questionSet,
        status: row.status,
        assignedAt: row.assigned_at,
        startedAt: row.started_at ?? null,
        completedAt: row.completed_at ?? null
    };
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findById(id) {
    const row = getDb()
        .prepare(
            `SELECT s.*, b.name AS battalion_name, t.title AS topic_title
             FROM exam_sessions s
             LEFT JOIN battalions b ON b.id = s.battalion_id
             LEFT JOIN topics t ON t.id = s.topic_id
             WHERE s.id = ?`
        )
        .get(id);
    return row || null;
}

/**
 * @returns {object[]}
 */
export function findAll() {
    return getDb()
        .prepare(
            `SELECT s.*, b.name AS battalion_name, t.title AS topic_title
             FROM exam_sessions s
             LEFT JOIN battalions b ON b.id = s.battalion_id
             LEFT JOIN topics t ON t.id = s.topic_id
             ORDER BY s.created_at DESC`
        )
        .all();
}

/**
 * @param {number} battalionId
 * @returns {object[]}
 */
export function findOpenForBattalion(battalionId) {
    return getDb()
        .prepare(
            `SELECT s.*, b.name AS battalion_name, t.title AS topic_title
             FROM exam_sessions s
             LEFT JOIN battalions b ON b.id = s.battalion_id
             LEFT JOIN topics t ON t.id = s.topic_id
             WHERE s.battalion_id = ?
               AND s.status = ?
               AND datetime(s.opens_at) <= datetime('now')
               AND datetime(s.closes_at) > datetime('now')
             ORDER BY s.closes_at ASC`
        )
        .all(battalionId, EXAM_SESSION_STATUS.OPEN);
}

/**
 * @param {object} data
 * @returns {object}
 */
export function createSession(data) {
    const result = getDb()
        .prepare(
            `INSERT INTO exam_sessions (
                battalion_id, type, topic_id, questions_per_set, number_of_sets,
                duration_minutes, opens_at, closes_at, status, needs_regeneration, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        )
        .run(
            data.battalionId,
            data.type,
            data.topicId ?? null,
            data.questionsPerSet,
            data.numberOfSets,
            data.durationMinutes,
            data.opensAt,
            data.closesAt,
            EXAM_SESSION_STATUS.DRAFT,
            data.createdBy
        );
    return findById(result.lastInsertRowid);
}

/**
 * @param {number} id
 * @param {object} fields
 * @returns {object|null}
 */
export function updateSession(id, fields) {
    const sets = [];
    const values = [];

    const map = {
        battalionId: 'battalion_id',
        type: 'type',
        topicId: 'topic_id',
        questionsPerSet: 'questions_per_set',
        numberOfSets: 'number_of_sets',
        durationMinutes: 'duration_minutes',
        opensAt: 'opens_at',
        closesAt: 'closes_at',
        status: 'status',
        needsRegeneration: 'needs_regeneration'
    };

    for (const [key, col] of Object.entries(map)) {
        if (fields[key] !== undefined) {
            sets.push(`${col} = ?`);
            values.push(
                key === 'needsRegeneration' ? (fields[key] ? 1 : 0) : fields[key]
            );
        }
    }

    if (!sets.length) return findById(id);

    values.push(id);
    getDb()
        .prepare(`UPDATE exam_sessions SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values);
    return findById(id);
}

/**
 * @param {number} topicId
 */
export function markNeedsRegenerationForTopic(topicId) {
    getDb()
        .prepare(
            `UPDATE exam_sessions
             SET needs_regeneration = 1
             WHERE type = 'topic' AND topic_id = ? AND status != ?`
        )
        .run(topicId, EXAM_SESSION_STATUS.OPEN);
}

/**
 * @param {number} sessionId
 */
export function deleteAssignmentsForSession(sessionId) {
    getDb().prepare('DELETE FROM exam_assignments WHERE session_id = ?').run(sessionId);
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @param {number[]} questionSet
 */
export function createAssignment(sessionId, userId, questionSet) {
    getDb()
        .prepare(
            `INSERT INTO exam_assignments (session_id, user_id, question_set, status)
             VALUES (?, ?, ?, 'assigned')`
        )
        .run(sessionId, userId, JSON.stringify(questionSet));
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @returns {object|null}
 */
export function findAssignment(sessionId, userId) {
    const row = getDb()
        .prepare('SELECT * FROM exam_assignments WHERE session_id = ? AND user_id = ?')
        .get(sessionId, userId);
    return row || null;
}

/**
 * @param {number} assignmentId
 * @param {object} fields
 */
export function updateAssignment(assignmentId, fields) {
    const sets = [];
    const values = [];
    if (fields.status !== undefined) {
        sets.push('status = ?');
        values.push(fields.status);
    }
    if (fields.startedAt !== undefined) {
        sets.push('started_at = ?');
        values.push(fields.startedAt);
    }
    if (fields.completedAt !== undefined) {
        sets.push('completed_at = ?');
        values.push(fields.completedAt);
    }
    if (!sets.length) return;
    values.push(assignmentId);
    getDb()
        .prepare(`UPDATE exam_assignments SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values);
}

/**
 * @param {number} battalionId
 * @returns {number[]}
 */
export function findApprovedUserIdsInBattalion(battalionId) {
    return getDb()
        .prepare(
            `SELECT id FROM users WHERE battalion_id = ? AND status = 'approved' AND role = 'user' ORDER BY id ASC`
        )
        .all(battalionId)
        .map(r => r.id);
}

/**
 * @param {object} data
 * @returns {object}
 */
export function createResult(data) {
    const result = getDb()
        .prepare(
            `INSERT INTO exam_results (assignment_id, user_id, session_id, score, total, duration_sec, detail)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            data.assignmentId,
            data.userId,
            data.sessionId,
            data.score,
            data.total,
            data.durationSec,
            data.detail ? JSON.stringify(data.detail) : null
        );
    return getDb().prepare('SELECT * FROM exam_results WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @returns {object|null}
 */
export function findResult(sessionId, userId) {
    return (
        getDb()
            .prepare('SELECT * FROM exam_results WHERE session_id = ? AND user_id = ?')
            .get(sessionId, userId) || null
    );
}
