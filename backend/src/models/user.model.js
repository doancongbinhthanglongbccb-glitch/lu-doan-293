import { getDb } from '../../database/connection.js';

/**
 * Map DB row to public user object (camelCase, no password).
 * @param {object} row
 * @returns {object}
 */
export function toPublicUser(row) {
    if (!row) return null;
    return {
        militaryId: row.military_id,
        fullName: row.full_name,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

/**
 * @param {number} id
 * @returns {object|null}
 */
export function findById(id) {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row || null;
}

/**
 * @param {number} id
 * @returns {object|null} Row without password_hash
 */
export function findByIdForAuth(id) {
    const row = findById(id);
    if (!row) return null;
    const { password_hash: _pw, ...safe } = row;
    return safe;
}

/**
 * @param {string} militaryId
 * @returns {object|null}
 */
export function findByMilitaryId(militaryId) {
    const row = getDb()
        .prepare('SELECT * FROM users WHERE military_id = ?')
        .get(String(militaryId).trim());
    return row || null;
}

/**
 * @returns {object[]}
 */
export function findAll() {
    return getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all();
}

/**
 * @param {object} data
 * @returns {object}
 */
export function createUser(data) {
    const now = new Date().toISOString();
    const result = getDb()
        .prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            data.militaryId,
            data.fullName,
            data.passwordHash,
            data.role || 'user',
            data.status || 'pending',
            now,
            now
        );
    return findById(result.lastInsertRowid);
}

/**
 * @param {string} militaryId
 * @param {object} fields
 * @returns {object|null}
 */
export function updateByMilitaryId(militaryId, fields) {
    const sets = [];
    const values = [];

    if (fields.fullName !== undefined) {
        sets.push('full_name = ?');
        values.push(fields.fullName);
    }
    if (fields.role !== undefined) {
        sets.push('role = ?');
        values.push(fields.role);
    }
    if (fields.status !== undefined) {
        sets.push('status = ?');
        values.push(fields.status);
    }
    if (fields.passwordHash !== undefined) {
        sets.push('password_hash = ?');
        values.push(fields.passwordHash);
    }

    if (sets.length === 0) return findByMilitaryId(militaryId);

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(String(militaryId).trim());

    getDb()
        .prepare(`UPDATE users SET ${sets.join(', ')} WHERE military_id = ?`)
        .run(...values);

    return findByMilitaryId(militaryId);
}

/**
 * @param {string} militaryId
 * @returns {boolean}
 */
export function deleteByMilitaryId(militaryId) {
    const result = getDb()
        .prepare('DELETE FROM users WHERE military_id = ?')
        .run(String(militaryId).trim());
    return result.changes > 0;
}

/**
 * @param {number} userId
 * @param {string} tokenHash
 * @param {string} expiresAt
 */
export function saveRefreshToken(userId, tokenHash, expiresAt) {
    const db = getDb();
    db.prepare(
        `DELETE FROM refresh_tokens WHERE datetime(expires_at) <= datetime('now') OR revoked = 1`
    ).run();
    db.prepare(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
    ).run(userId, tokenHash, expiresAt);
}

/**
 * @param {string} tokenHash
 * @returns {object|null}
 */
export function findRefreshToken(tokenHash) {
    return (
        getDb()
            .prepare(
                `SELECT * FROM refresh_tokens
                 WHERE token_hash = ? AND revoked = 0 AND datetime(expires_at) > datetime('now')`
            )
            .get(tokenHash) || null
    );
}

/**
 * @param {string} tokenHash
 */
export function revokeRefreshToken(tokenHash) {
    getDb()
        .prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?')
        .run(tokenHash);
}

/**
 * Revoke all refresh tokens for a user.
 * @param {number} userId
 */
export function revokeAllRefreshTokens(userId) {
    getDb()
        .prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0')
        .run(userId);
}
