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
 * Câu thuộc đề Kiểm tra của user mà đợt chưa closed (in_progress hoặc đã nộp).
 * @param {number} userId
 * @param {number} questionId
 * @returns {boolean}
 */
export function userHasQuestionInUnclosedSession(userId, questionId) {
    const id = Number(questionId);
    if (!Number.isInteger(id) || id < 1) return false;
    const rows = getDb()
        .prepare(
            `SELECT a.question_set
             FROM exam_assignments a
             INNER JOIN exam_sessions s ON s.id = a.session_id
             WHERE a.user_id = ? AND s.status != ?`
        )
        .all(userId, EXAM_SESSION_STATUS.CLOSED);
    return rows.some(row => {
        try {
            const ids = JSON.parse(row.question_set);
            return Array.isArray(ids) && ids.map(Number).includes(id);
        } catch {
            return false;
        }
    });
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

function parseResultDetail(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function mapResultRow(row) {
    const detail = parseResultDetail(row.detail);
    const topicId = row.topic_id == null ? null : Number(row.topic_id);
    const branch = topicId == null ? 'mixed' : 'topic';
    return {
        id: row.id,
        source: 'check',
        mode: 'check',
        userId: row.user_id,
        militaryId: row.military_id ?? null,
        fullName: row.full_name ?? null,
        battalionId: row.battalion_id ?? null,
        battalionName: row.battalion_name ?? null,
        sessionId: row.session_id,
        assignmentId: row.assignment_id ?? null,
        topicId,
        topicTitle: row.topic_title || (topicId == null ? 'Trộn tổng hợp' : null),
        branch,
        score: row.score,
        total: row.total,
        durationSec: row.duration_sec,
        detail,
        createdAt: row.created_at
    };
}

const RESULT_SELECT = `
    SELECT r.id, r.assignment_id, r.user_id, r.session_id, r.score, r.total, r.duration_sec,
           r.detail, r.created_at,
           a.topic_id,
           t.title AS topic_title,
           u.military_id, u.full_name, u.battalion_id,
           b.name AS battalion_name
    FROM exam_results r
    LEFT JOIN exam_assignments a ON a.id = r.assignment_id
    LEFT JOIN topics t ON t.id = a.topic_id
    INNER JOIN users u ON u.id = r.user_id
    LEFT JOIN battalions b ON b.id = u.battalion_id
`;

/**
 * Lính: kết quả Kiểm tra của chính mình.
 * @param {number} userId
 * @param {number} [limit]
 */
export function listResultsForUser(userId, options = {}) {
    const opts = typeof options === 'number' ? { limit: options } : options;
    const safeLimit = Math.min(Math.max(1, opts.limit ?? 50), 200);
    const branch = opts.branch === 'mixed' || opts.branch === 'topic' ? opts.branch : '';
    const clauses = ['r.user_id = ?'];
    const params = [userId];
    if (branch === 'mixed') {
        clauses.push('a.topic_id IS NULL');
    } else if (branch === 'topic') {
        clauses.push('a.topic_id IS NOT NULL');
    }
    return getDb()
        .prepare(
            `${RESULT_SELECT}
             WHERE ${clauses.join(' AND ')}
             ORDER BY datetime(r.created_at) DESC, r.id DESC
             LIMIT ?`
        )
        .all(...params, safeLimit)
        .map(mapResultRow);
}

/**
 * Admin: kết quả Kiểm tra, lọc tiểu đoàn / nhánh / user.
 * @param {object} [options]
 */
export function listResultsAdmin({
    battalionId = null,
    branch = '',
    search = '',
    limit = 200
} = {}) {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const clauses = [];
    const params = [];

    if (battalionId) {
        clauses.push('u.battalion_id = ?');
        params.push(battalionId);
    }
    if (branch === 'mixed') {
        clauses.push('a.topic_id IS NULL');
    } else if (branch === 'topic') {
        clauses.push('a.topic_id IS NOT NULL');
    }
    const term = String(search || '').trim();
    if (term) {
        const like = `%${term}%`;
        clauses.push('(u.military_id LIKE ? OR LOWER(u.full_name) LIKE LOWER(?))');
        params.push(like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
        .prepare(
            `${RESULT_SELECT}
             ${where}
             ORDER BY datetime(r.created_at) DESC, r.id DESC
             LIMIT ?`
        )
        .all(...params, safeLimit)
        .map(mapResultRow);
}

/**
 * Tiến độ: tiểu đoàn × lĩnh vực gốc (+ cột Trộn) cho một đợt.
 * Ô chưa từng có kết quả = null (UI hiện "—").
 * @param {number} sessionId
 */
export function getProgressMatrix(sessionId) {
    const sessionBattalions = findBattalionsForSession(sessionId);
    const openedTopics = findTopicsForSession(sessionId);
    const openedTopicIds = new Set(openedTopics.map(t => t.id));
    const mixedOpened = findSetsForSession(sessionId, null).length > 0;

    const allRoots = getDb()
        .prepare(
            `SELECT id, title
             FROM topics
             WHERE parent_id IS NULL
             ORDER BY sort_order ASC, id ASC`
        )
        .all();

    const columns = [
        ...allRoots.map(t => ({
            key: `topic:${t.id}`,
            kind: 'topic',
            topicId: t.id,
            title: t.title,
            opened: openedTopicIds.has(t.id)
        })),
        {
            key: 'mixed',
            kind: 'mixed',
            topicId: null,
            title: 'Trộn tổng hợp',
            opened: mixedOpened
        }
    ];

    const rosterByBattalion = new Map(
        getDb()
            .prepare(
                `SELECT battalion_id, COUNT(*) AS roster
                 FROM users
                 WHERE status = 'approved'
                   AND role = 'user'
                   AND battalion_id IS NOT NULL
                 GROUP BY battalion_id`
            )
            .all()
            .map(row => [row.battalion_id, row.roster])
    );

    const stats = getDb()
        .prepare(
            `SELECT u.battalion_id,
                    a.topic_id,
                    COUNT(DISTINCT r.user_id) AS taken,
                    AVG(r.score) AS avg_score,
                    MAX(r.score) AS max_score,
                    MIN(r.score) AS min_score
             FROM exam_results r
             INNER JOIN users u ON u.id = r.user_id
             LEFT JOIN exam_assignments a ON a.id = r.assignment_id
             WHERE r.session_id = ?
             GROUP BY u.battalion_id, a.topic_id`
        )
        .all(sessionId);

    const byCell = new Map();
    stats.forEach(row => {
        const key = `${row.battalion_id}:${row.topic_id == null ? 'mixed' : row.topic_id}`;
        byCell.set(key, {
            taken: row.taken,
            avg: row.avg_score,
            max: row.max_score,
            min: row.min_score
        });
    });

    const rows = sessionBattalions.map(b => {
        const roster = rosterByBattalion.get(b.id) ?? 0;
        const cells = {};
        columns.forEach(col => {
            if (!col.opened) {
                cells[col.key] = null;
                return;
            }
            const lookup = `${b.id}:${col.kind === 'mixed' ? 'mixed' : col.topicId}`;
            const hit = byCell.get(lookup);
            cells[col.key] = {
                taken: hit?.taken ?? 0,
                roster,
                avg: hit?.avg != null ? Math.round(hit.avg * 10) / 10 : null,
                max: hit?.max != null ? Math.round(hit.max * 10) / 10 : null,
                min: hit?.min != null ? Math.round(hit.min * 10) / 10 : null
            };
        });
        return { battalionId: b.id, battalionName: b.name, roster, cells };
    });

    return { columns, rows };
}

/**
 * Điểm Kiểm tra gắn theo tiểu đoàn hiện tại của user (dashboard đăng ký).
 * @returns {Map<number, { taken: number, avg: number|null, max: number|null, min: number|null }>}
 */
export function getCheckScoreStatsByBattalion() {
    const rows = getDb()
        .prepare(
            `SELECT u.battalion_id AS battalion_id,
                    COUNT(DISTINCT r.user_id) AS taken,
                    AVG(r.score) AS avg_score,
                    MAX(r.score) AS max_score,
                    MIN(r.score) AS min_score
             FROM exam_results r
             INNER JOIN users u ON u.id = r.user_id
             WHERE u.battalion_id IS NOT NULL
             GROUP BY u.battalion_id`
        )
        .all();
    const map = new Map();
    rows.forEach(row => {
        map.set(row.battalion_id, {
            taken: row.taken,
            avg: row.avg_score != null ? Math.round(row.avg_score * 10) / 10 : null,
            max: row.max_score != null ? Math.round(row.max_score * 10) / 10 : null,
            min: row.min_score != null ? Math.round(row.min_score * 10) / 10 : null
        });
    });
    return map;
}
