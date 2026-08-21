import { getDb } from '../../database/connection.js';
import { LECTURE_STATUS } from '../config/constants.js';

/**
 * @param {number} lectureId
 * @returns {{ id: number, name: string }[]}
 */
export function findBattalionsForLecture(lectureId) {
    return getDb()
        .prepare(
            `SELECT b.id, b.name
             FROM lecture_battalions lb
             INNER JOIN battalions b ON b.id = lb.battalion_id
             WHERE lb.lecture_id = ?
             ORDER BY b.name ASC`
        )
        .all(lectureId);
}

function withBattalions(row) {
    if (!row) return null;
    const battalions = findBattalionsForLecture(row.id);
    return { ...row, battalions };
}

/**
 * 0 row trong lecture_battalions = hiện cho tất cả.
 * @param {number} lectureId
 * @param {number|null} battalionId
 * @returns {boolean}
 */
export function lectureVisibleToBattalion(lectureId, battalionId) {
    const assigned = getDb()
        .prepare('SELECT battalion_id FROM lecture_battalions WHERE lecture_id = ?')
        .all(lectureId);
    if (!assigned.length) return true;
    if (battalionId == null) return false;
    return assigned.some(row => row.battalion_id === battalionId);
}

/**
 * @param {number} lectureId
 * @param {number[]} battalionIds
 */
export function replaceLectureBattalions(lectureId, battalionIds) {
    const db = getDb();
    db.prepare('DELETE FROM lecture_battalions WHERE lecture_id = ?').run(lectureId);
    if (!battalionIds?.length) return;
    const insert = db.prepare(
        'INSERT INTO lecture_battalions (lecture_id, battalion_id) VALUES (?, ?)'
    );
    battalionIds.forEach(id => insert.run(lectureId, id));
}

/**
 * @param {object} fields
 * @returns {object}
 */
export function create(fields) {
    const db = getDb();
    const result = db
        .prepare(
            `INSERT INTO lectures (
                title, description, type, storage_key, original_name, mime_type,
                size_bytes, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            fields.title,
            fields.description ?? null,
            fields.type,
            fields.storage_key,
            fields.original_name ?? null,
            fields.mime_type ?? null,
            fields.size_bytes ?? null,
            fields.status || LECTURE_STATUS.PENDING,
            fields.created_by
        );
    replaceLectureBattalions(result.lastInsertRowid, fields.battalion_ids || []);
    return findById(result.lastInsertRowid);
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findById(id) {
    const row = getDb().prepare('SELECT * FROM lectures WHERE id = ?').get(id);
    return withBattalions(row);
}

/**
 * @param {{ type?: string, battalion_id?: number, status?: string }} [filters]
 * @returns {object[]}
 */
export function listForAdmin(filters = {}) {
    const clauses = [];
    const params = [];
    if (filters.type) {
        clauses.push('l.type = ?');
        params.push(filters.type);
    }
    if (filters.status) {
        clauses.push('l.status = ?');
        params.push(filters.status);
    }
    if (filters.battalion_id) {
        clauses.push(
            `EXISTS (
                SELECT 1 FROM lecture_battalions lb
                WHERE lb.lecture_id = l.id AND lb.battalion_id = ?
            )`
        );
        params.push(filters.battalion_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = getDb()
        .prepare(`SELECT l.* FROM lectures l ${where} ORDER BY l.created_at DESC, l.id DESC`)
        .all(...params);
    return rows.map(withBattalions);
}

/**
 * Chỉ status=ready; không gán tiểu đoàn HOẶC khớp battalionId.
 * @param {number|null} battalionId
 * @returns {object[]}
 */
export function listForUser(battalionId) {
    const rows = getDb()
        .prepare(
            `SELECT l.*
             FROM lectures l
             WHERE l.status = ?
               AND (
                    NOT EXISTS (SELECT 1 FROM lecture_battalions lb WHERE lb.lecture_id = l.id)
                    OR EXISTS (
                        SELECT 1 FROM lecture_battalions lb
                        WHERE lb.lecture_id = l.id AND lb.battalion_id = ?
                    )
               )
             ORDER BY l.created_at DESC, l.id DESC`
        )
        .all(LECTURE_STATUS.READY, battalionId ?? -1);
    return rows.map(withBattalions);
}

/**
 * @param {number} id
 * @param {object} fields
 * @returns {object|null}
 */
export function update(id, fields) {
    const sets = [];
    const values = [];
    if (fields.title !== undefined) {
        sets.push('title = ?');
        values.push(fields.title);
    }
    if (fields.description !== undefined) {
        sets.push('description = ?');
        values.push(fields.description);
    }
    if (sets.length) {
        sets.push("updated_at = datetime('now')");
        values.push(id);
        getDb()
            .prepare(`UPDATE lectures SET ${sets.join(', ')} WHERE id = ?`)
            .run(...values);
    }
    if (fields.battalion_ids !== undefined) {
        replaceLectureBattalions(id, fields.battalion_ids);
        getDb()
            .prepare("UPDATE lectures SET updated_at = datetime('now') WHERE id = ?")
            .run(id);
    }
    return findById(id);
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function confirmReady(id) {
    getDb()
        .prepare(
            `UPDATE lectures SET status = ?, updated_at = datetime('now') WHERE id = ?`
        )
        .run(LECTURE_STATUS.READY, id);
    return findById(id);
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function deleteById(id) {
    const result = getDb().prepare('DELETE FROM lectures WHERE id = ?').run(id);
    return result.changes > 0;
}
