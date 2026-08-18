import { getDb } from '../../database/connection.js';
import { EXAM_SESSION_STATUS } from '../config/constants.js';
import { runTransaction } from '../utils/transaction.js';

/**
 * Admin payload — includes set count and regeneration flags.
 * @param {object} row
 * @returns {object}
 */
export function toPublicSession(row) {
    if (!row) return null;
    const battalions = row.battalions || [];
    return {
        id: row.id,
        battalionId: battalions[0]?.id ?? row.battalion_id,
        battalionIds: battalions.map(b => b.id),
        battalionName: battalions.map(b => b.name).join(', ') || row.battalion_name || null,
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
export function findBattalionsForSession(sessionId) {
    return getDb()
        .prepare(
            `SELECT b.id, b.name
             FROM exam_session_battalions sb
             INNER JOIN battalions b ON b.id = sb.battalion_id
             WHERE sb.session_id = ?
             ORDER BY b.name ASC`
        )
        .all(sessionId);
}

function withBattalions(row) {
    if (!row) return null;
    const battalions = findBattalionsForSession(row.id);
    return {
        ...row,
        battalions,
        battalion_id: battalions[0]?.id ?? row.battalion_id,
        battalion_name: battalions.map(b => b.name).join(', ') || row.battalion_name || null
    };
}

export function replaceSessionBattalions(sessionId, battalionIds) {
    const db = getDb();
    db.prepare('DELETE FROM exam_session_battalions WHERE session_id = ?').run(sessionId);
    const insert = db.prepare(
        'INSERT INTO exam_session_battalions (session_id, battalion_id) VALUES (?, ?)'
    );
    battalionIds.forEach(id => insert.run(sessionId, id));
}

export function sessionHasBattalion(sessionId, battalionId) {
    return !!getDb()
        .prepare(
            'SELECT 1 FROM exam_session_battalions WHERE session_id = ? AND battalion_id = ?'
        )
        .get(sessionId, battalionId);
}

/**
 * Open sessions that already include any of these battalions.
 * @param {number[]} battalionIds
 * @param {number|null} [excludeSessionId]
 * @returns {{ id: number, battalion_name: string }[]}
 */
export function findOpenConflicts(battalionIds, excludeSessionId = null) {
    if (!battalionIds?.length) return [];
    const placeholders = battalionIds.map(() => '?').join(',');
    const params = [...battalionIds, EXAM_SESSION_STATUS.OPEN];
    let sql = `SELECT DISTINCT s.id, b.name AS battalion_name
               FROM exam_sessions s
               INNER JOIN exam_session_battalions sb ON sb.session_id = s.id
               INNER JOIN battalions b ON b.id = sb.battalion_id
               WHERE sb.battalion_id IN (${placeholders})
                 AND s.status = ?`;
    if (excludeSessionId) {
        sql += ' AND s.id != ?';
        params.push(excludeSessionId);
    }
    return getDb().prepare(sql).all(...params);
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findById(id) {
    const row = getDb()
        .prepare(
            `SELECT s.*, t.title AS topic_title
             FROM exam_sessions s
             LEFT JOIN topics t ON t.id = s.topic_id
             WHERE s.id = ?`
        )
        .get(id);
    return withBattalions(row);
}

/**
 * @returns {object[]}
 */
export function findAll() {
    return getDb()
        .prepare(
            `SELECT s.*, t.title AS topic_title
             FROM exam_sessions s
             LEFT JOIN topics t ON t.id = s.topic_id
             ORDER BY s.created_at DESC`
        )
        .all()
        .map(withBattalions);
}

/**
 * @param {number} battalionId
 * @returns {object[]}
 */
export function findOpenForBattalion(battalionId) {
    return getDb()
        .prepare(
            `SELECT s.*, t.title AS topic_title
             FROM exam_sessions s
             INNER JOIN exam_session_battalions sb ON sb.session_id = s.id
             LEFT JOIN topics t ON t.id = s.topic_id
             WHERE sb.battalion_id = ?
               AND s.status = ?
             ORDER BY s.closes_at ASC`
        )
        .all(battalionId, EXAM_SESSION_STATUS.OPEN)
        .map(withBattalions);
}

/**
 * @param {object} data
 * @returns {object}
 */
export function createSession(data) {
    const battalionIds = data.battalionIds;
    let newId;
    runTransaction(getDb(), () => {
        const result = getDb()
            .prepare(
                `INSERT INTO exam_sessions (
                    battalion_id, type, topic_id, questions_per_set, number_of_sets,
                    duration_minutes, opens_at, closes_at, status, needs_regeneration, created_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
            )
            .run(
                battalionIds[0],
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
        newId = Number(result.lastInsertRowid);
        replaceSessionBattalions(newId, battalionIds);
    });
    return findById(newId);
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

    if (!sets.length && fields.battalionIds === undefined) return findById(id);

    if (sets.length) {
        values.push(id);
        getDb()
            .prepare(`UPDATE exam_sessions SET ${sets.join(', ')} WHERE id = ?`)
            .run(...values);
    }

    if (Array.isArray(fields.battalionIds) && fields.battalionIds.length) {
        replaceSessionBattalions(id, fields.battalionIds);
        getDb()
            .prepare('UPDATE exam_sessions SET battalion_id = ? WHERE id = ?')
            .run(fields.battalionIds[0], id);
    }

    return findById(id);
}

/**
 * @param {number} topicId
 */
export function markNeedsRegenerationForTopic(_topicId) {
    getDb()
        .prepare(
            `UPDATE exam_sessions
             SET needs_regeneration = 1
             WHERE status != ?`
        )
        .run(EXAM_SESSION_STATUS.OPEN);
}

/**
 * @param {number} sessionId
 */
export function deleteAssignmentsForSession(sessionId) {
    getDb().prepare('DELETE FROM exam_assignments WHERE session_id = ?').run(sessionId);
}

export function deleteSetsForSession(sessionId) {
    getDb().prepare('DELETE FROM exam_session_sets WHERE session_id = ?').run(sessionId);
}

/**
 * @param {number} sessionId
 * @param {number|null} topicId
 * @param {number} setIndex
 * @param {number[]} questionIds
 * @returns {number} new set id
 */
export function insertSessionSet(sessionId, topicId, setIndex, questionIds) {
    const result = getDb()
        .prepare(
            `INSERT INTO exam_session_sets (session_id, topic_id, set_index, question_ids)
             VALUES (?, ?, ?, ?)`
        )
        .run(sessionId, topicId, setIndex, JSON.stringify(questionIds));
    return Number(result.lastInsertRowid);
}

/**
 * @param {number} sessionId
 * @param {number|null} topicId
 * @returns {object[]}
 */
export function findSetsForSession(sessionId, topicId = undefined) {
    if (topicId === undefined) {
        return getDb()
            .prepare(
                `SELECT s.*, t.title AS topic_title
                 FROM exam_session_sets s
                 LEFT JOIN topics t ON t.id = s.topic_id
                 WHERE s.session_id = ?
                 ORDER BY s.topic_id ASC, s.set_index ASC`
            )
            .all(sessionId);
    }
    if (topicId == null) {
        return getDb()
            .prepare(
                `SELECT * FROM exam_session_sets
                 WHERE session_id = ? AND topic_id IS NULL
                 ORDER BY set_index ASC`
            )
            .all(sessionId);
    }
    return getDb()
        .prepare(
            `SELECT * FROM exam_session_sets
             WHERE session_id = ? AND topic_id = ?
             ORDER BY set_index ASC`
        )
        .all(sessionId, topicId);
}

/**
 * @param {number} setId
 * @returns {object|null}
 */
export function findSetById(setId) {
    return getDb().prepare('SELECT * FROM exam_session_sets WHERE id = ?').get(setId) || null;
}

/**
 * Pick the least-used set for a session/topic.
 * @param {number} sessionId
 * @param {number|null} topicId
 * @returns {object|null}
 */
export function findLeastUsedSet(sessionId, topicId) {
    const sql =
        topicId == null
            ? `SELECT s.*, COUNT(a.id) AS assign_count
               FROM exam_session_sets s
               LEFT JOIN exam_assignments a ON a.session_set_id = s.id
               WHERE s.session_id = ? AND s.topic_id IS NULL
               GROUP BY s.id
               ORDER BY assign_count ASC, s.set_index ASC
               LIMIT 1`
            : `SELECT s.*, COUNT(a.id) AS assign_count
               FROM exam_session_sets s
               LEFT JOIN exam_assignments a ON a.session_set_id = s.id
               WHERE s.session_id = ? AND s.topic_id = ?
               GROUP BY s.id
               ORDER BY assign_count ASC, s.set_index ASC
               LIMIT 1`;
    const params = topicId == null ? [sessionId] : [sessionId, topicId];
    return getDb().prepare(sql).get(...params) || null;
}

/**
 * Distinct topics that have generated sets in this session.
 * @param {number} sessionId
 * @returns {{ id: number, title: string }[]}
 */
export function findTopicsForSession(sessionId) {
    return getDb()
        .prepare(
            `SELECT DISTINCT t.id, t.title
             FROM exam_session_sets s
             INNER JOIN topics t ON t.id = s.topic_id
             WHERE s.session_id = ?
               AND t.parent_id IS NULL
             ORDER BY t.sort_order ASC, t.id ASC`
        )
        .all(sessionId);
}

/**
 * @param {object} data
 */
export function createAssignment(data) {
    getDb()
        .prepare(
            `INSERT INTO exam_assignments
                (session_id, user_id, topic_id, session_set_id, question_set, status)
             VALUES (?, ?, ?, ?, ?, 'assigned')`
        )
        .run(
            data.sessionId,
            data.userId,
            data.topicId ?? null,
            data.sessionSetId ?? null,
            JSON.stringify(data.questionSet)
        );
}

/**
 * @param {number} sessionId
 * @param {number} userId
 * @param {number|null} [topicId]
 * @returns {object|null}
 */
export function findAssignment(sessionId, userId, topicId = undefined) {
    if (topicId === undefined) {
        return (
            getDb()
                .prepare('SELECT * FROM exam_assignments WHERE session_id = ? AND user_id = ?')
                .get(sessionId, userId) || null
        );
    }
    if (topicId == null) {
        return (
            getDb()
                .prepare(
                    `SELECT * FROM exam_assignments
                     WHERE session_id = ? AND user_id = ? AND topic_id IS NULL`
                )
                .get(sessionId, userId) || null
        );
    }
    return (
        getDb()
            .prepare(
                `SELECT * FROM exam_assignments
                 WHERE session_id = ? AND user_id = ? AND topic_id = ?`
            )
            .get(sessionId, userId, topicId) || null
    );
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
export function findResultByAssignment(assignmentId) {
    return (
        getDb()
            .prepare('SELECT * FROM exam_results WHERE assignment_id = ?')
            .get(assignmentId) || null
    );
}
