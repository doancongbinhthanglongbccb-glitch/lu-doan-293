import { getDb } from '../../database/connection.js';

/**
 * @param {object} row
 * @returns {object}
 */
export function toPublicBattalion(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        isActive: !!row.is_active,
        userCount: row.user_count ?? undefined
    };
}

/**
 * @param {boolean} [activeOnly]
 * @returns {object[]}
 */
export function findAll(activeOnly = false) {
    const sql = activeOnly
        ? 'SELECT * FROM battalions WHERE is_active = 1 ORDER BY name ASC'
        : 'SELECT * FROM battalions ORDER BY name ASC';
    return getDb().prepare(sql).all();
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findById(id) {
    const row = getDb().prepare('SELECT * FROM battalions WHERE id = ?').get(id);
    return row || null;
}

/**
 * @param {string} name
 * @returns {object}
 */
export function create(name) {
    const result = getDb()
        .prepare('INSERT INTO battalions (name, is_active) VALUES (?, 1)')
        .run(name.trim());
    return findById(result.lastInsertRowid);
}

/**
 * @param {number} id
 * @param {object} fields
 * @returns {object|null}
 */
export function update(id, fields) {
    const sets = [];
    const values = [];

    if (fields.name !== undefined) {
        sets.push('name = ?');
        values.push(fields.name.trim());
    }
    if (fields.isActive !== undefined) {
        sets.push('is_active = ?');
        values.push(fields.isActive ? 1 : 0);
    }

    if (sets.length === 0) return findById(id);

    values.push(id);
    getDb()
        .prepare(`UPDATE battalions SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values);

    return findById(id);
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function deleteById(id) {
    const result = getDb().prepare('DELETE FROM battalions WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * @param {number} battalionId
 * @returns {number}
 */
export function countUsers(battalionId) {
    const row = getDb()
        .prepare('SELECT COUNT(*) AS n FROM users WHERE battalion_id = ?')
        .get(battalionId);
    return row?.n ?? 0;
}

/**
 * Đếm user đăng ký theo tiểu đoàn (dashboard Giai đoạn 1).
 * @returns {object[]}
 */
export function getRegistrationCounts() {
    return getDb()
        .prepare(
            `SELECT b.id, b.name, b.is_active, COUNT(u.id) AS user_count
             FROM battalions b
             LEFT JOIN users u ON u.battalion_id = b.id
             GROUP BY b.id
             ORDER BY b.name ASC`
        )
        .all();
}

/**
 * @returns {object[]}
 */
export function findAllWithUserCounts() {
    return getDb()
        .prepare(
            `SELECT b.*, COUNT(u.id) AS user_count
             FROM battalions b
             LEFT JOIN users u ON u.battalion_id = b.id
             GROUP BY b.id
             ORDER BY b.name ASC`
        )
        .all();
}
