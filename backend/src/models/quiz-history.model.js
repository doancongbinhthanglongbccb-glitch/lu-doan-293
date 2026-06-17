import { getDb } from '../../database/connection.js';

const HISTORY_COLUMNS = 'id, mode, score, total, duration_sec, detail, created_at';

/**
 * @typedef {Object} QuizHistoryRecord
 * @property {number} id
 * @property {string} mode
 * @property {number|null} score
 * @property {number|null} total
 * @property {number|null} durationSec
 * @property {object|null} detail
 * @property {string} createdAt
 */

/**
 * @param {object} row
 * @returns {QuizHistoryRecord}
 */
function mapRow(row) {
    let detail = null;
    if (row.detail) {
        try {
            detail = JSON.parse(row.detail);
        } catch {
            detail = null;
        }
    }
    return {
        id: row.id,
        mode: row.mode,
        score: row.score,
        total: row.total,
        durationSec: row.duration_sec,
        detail,
        createdAt: row.created_at
    };
}

/**
 * Insert an exam/quiz session record.
 * @param {number} userId
 * @param {object} payload
 * @returns {QuizHistoryRecord}
 */
export function insertRecord(userId, { mode, score, total, durationSec, detail }) {
    const db = getDb();
    const detailJson = detail != null ? JSON.stringify(detail) : null;
    const result = db
        .prepare(
            `INSERT INTO user_quiz_history (user_id, mode, score, total, duration_sec, detail)
             VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(userId, mode, score, total, durationSec, detailJson);

    const row = db
        .prepare(`SELECT ${HISTORY_COLUMNS} FROM user_quiz_history WHERE id = ?`)
        .get(result.lastInsertRowid);

    return mapRow(row);
}

/**
 * List quiz history for a user (newest first).
 * @param {number} userId
 * @param {number} [limit]
 * @returns {QuizHistoryRecord[]}
 */
export function listByUser(userId, limit = 50) {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const rows = getDb()
        .prepare(
            `SELECT ${HISTORY_COLUMNS}
             FROM user_quiz_history
             WHERE user_id = ?
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT ?`
        )
        .all(userId, safeLimit);

    return rows.map(mapRow);
}

/**
 * @param {object} row
 * @returns {QuizHistoryRecord & { userId: number, militaryId: string, fullName: string }}
 */
function mapRowWithUser(row) {
    return {
        ...mapRow(row),
        userId: row.user_id,
        militaryId: row.military_id,
        fullName: row.full_name
    };
}

/**
 * List exam history for all users (admin).
 * @param {object} [options]
 * @param {string} [options.search] - Filter by military ID or full name
 * @param {number} [options.limit]
 */
export function listAll({ search = '', limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const term = String(search || '').trim();

    let sql = `
        SELECT h.id, h.user_id, h.mode, h.score, h.total, h.duration_sec, h.detail, h.created_at,
               u.military_id, u.full_name
        FROM user_quiz_history h
        INNER JOIN users u ON u.id = h.user_id`;

    const params = [];
    if (term) {
        const like = `%${term}%`;
        sql += ` WHERE (u.military_id LIKE ? OR LOWER(u.full_name) LIKE LOWER(?))`;
        params.push(like, like);
    }

    sql += ` ORDER BY datetime(h.created_at) DESC, h.id DESC LIMIT ?`;
    params.push(safeLimit);

    const rows = getDb().prepare(sql).all(...params);
    return rows.map(mapRowWithUser);
}
