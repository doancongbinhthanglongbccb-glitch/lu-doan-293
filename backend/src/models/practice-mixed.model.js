import { getDb } from '../../database/connection.js';

/**
 * @param {string|null} raw
 * @returns {number[]}
 */
function parseIdList(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0);
    } catch {
        return [];
    }
}

export function deleteAllSets() {
    getDb().exec('DELETE FROM practice_mixed_sets');
}

/**
 * @param {number} setIndex
 * @param {number[]} questionIds
 */
export function insertSet(setIndex, questionIds) {
    getDb()
        .prepare('INSERT INTO practice_mixed_sets (set_index, question_ids) VALUES (?, ?)')
        .run(setIndex, JSON.stringify(questionIds));
}

/**
 * @returns {object[]}
 */
export function findAllSets() {
    return getDb()
        .prepare('SELECT * FROM practice_mixed_sets ORDER BY set_index ASC, id ASC')
        .all();
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findSetById(id) {
    return getDb().prepare('SELECT * FROM practice_mixed_sets WHERE id = ?').get(id) || null;
}

/**
 * @param {object} row
 * @returns {number[]}
 */
export function questionIdsOf(row) {
    return parseIdList(row?.question_ids);
}

/**
 * @param {number} userId
 * @param {number} setId
 * @returns {number[]}
 */
export function getAnsweredIds(userId, setId) {
    const row = getDb()
        .prepare('SELECT answered_ids FROM practice_mixed_progress WHERE user_id = ? AND set_id = ?')
        .get(userId, setId);
    return parseIdList(row?.answered_ids);
}

/**
 * @param {number} userId
 * @returns {Map<number, number[]>}
 */
export function getAnsweredIdsBySet(userId) {
    const rows = getDb()
        .prepare('SELECT set_id, answered_ids FROM practice_mixed_progress WHERE user_id = ?')
        .all(userId);
    const map = new Map();
    rows.forEach(row => {
        map.set(row.set_id, parseIdList(row.answered_ids));
    });
    return map;
}

/**
 * @param {number} userId
 * @param {number} setId
 * @param {number[]} answeredIds
 */
export function upsertAnsweredIds(userId, setId, answeredIds) {
    getDb()
        .prepare(
            `INSERT INTO practice_mixed_progress (user_id, set_id, answered_ids, updated_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(user_id, set_id) DO UPDATE SET
                answered_ids = excluded.answered_ids,
                updated_at = datetime('now')`
        )
        .run(userId, setId, JSON.stringify(answeredIds));
}
