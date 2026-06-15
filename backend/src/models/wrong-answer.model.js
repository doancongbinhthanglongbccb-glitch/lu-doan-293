import { getDb } from '../../database/connection.js';
import { runTransaction } from '../utils/transaction.js';

/**
 * Get wrong/correct history maps for a user.
 * @param {number} userId
 * @returns {{ wrongHistory: Record<string, number>, correctHistory: Record<string, number> }}
 */
export function getHistory(userId) {
    const rows = getDb()
        .prepare(
            `SELECT question_hash, wrong_count, correct_streak FROM wrong_answers WHERE user_id = ?`
        )
        .all(userId);

    const wrongHistory = {};
    const correctHistory = {};

    rows.forEach(row => {
        if (row.wrong_count > 0) {
            wrongHistory[row.question_hash] = row.wrong_count;
        }
        if (row.correct_streak > 0) {
            correctHistory[row.question_hash] = row.correct_streak;
        }
    });

    return { wrongHistory, correctHistory };
}

/**
 * Merge and upsert wrong/correct history for a user.
 * @param {number} userId
 * @param {Record<string, number>} wrongHistory
 * @param {Record<string, number>} correctHistory
 */
export function saveHistory(userId, wrongHistory = {}, correctHistory = {}) {
    const db = getDb();
    const allHashes = new Set([
        ...Object.keys(wrongHistory || {}),
        ...Object.keys(correctHistory || {})
    ]);

    const upsert = db.prepare(
        `INSERT INTO wrong_answers (user_id, question_hash, wrong_count, correct_streak, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, question_hash) DO UPDATE SET
            wrong_count = excluded.wrong_count,
            correct_streak = excluded.correct_streak,
            updated_at = datetime('now')`
    );

    const removeZero = db.prepare(
        `DELETE FROM wrong_answers WHERE user_id = ? AND question_hash = ? AND wrong_count <= 0 AND correct_streak <= 0`
    );

    runTransaction(db, () => {
        allHashes.forEach(hash => {
            const wrong = Number(wrongHistory[hash] || 0);
            const correct = Number(correctHistory[hash] || 0);

            if (wrong <= 0 && correct <= 0) {
                removeZero.run(userId, hash);
            } else {
                upsert.run(userId, hash, Math.max(0, wrong), Math.max(0, correct));
            }
        });
    });
    return getHistory(userId);
}
