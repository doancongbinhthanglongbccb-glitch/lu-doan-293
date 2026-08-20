import { getDb } from '../../database/connection.js';
import { runTransaction } from '../utils/transaction.js';
import { WRONG_REVIEW_CORRECT_THRESHOLD } from '../config/constants.js';

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

/**
 * Ghi nhận đúng/sai theo kết quả chấm server — không nhận count từ client.
 * @param {number} userId
 * @param {string} hash
 * @param {boolean} isCorrect
 */
export function recordAnswerResult(userId, hash, isCorrect) {
    if (!userId || typeof hash !== 'string' || !hash.trim()) return;
    const key = hash.trim();
    const row = getDb()
        .prepare(
            `SELECT wrong_count, correct_streak FROM wrong_answers
             WHERE user_id = ? AND question_hash = ?`
        )
        .get(userId, key);

    let wrong = Number(row?.wrong_count) || 0;
    let streak = Number(row?.correct_streak) || 0;

    if (!isCorrect) {
        wrong += 1;
        streak = 0;
    } else if (wrong > 0) {
        wrong -= 1;
        streak += 1;
        if (streak >= WRONG_REVIEW_CORRECT_THRESHOLD) {
            wrong = 0;
            streak = 0;
        }
        if (wrong <= 0) {
            wrong = 0;
            streak = 0;
        }
    } else {
        return;
    }

    if (wrong <= 0 && streak <= 0) {
        getDb()
            .prepare('DELETE FROM wrong_answers WHERE user_id = ? AND question_hash = ?')
            .run(userId, key);
        return;
    }

    getDb()
        .prepare(
            `INSERT INTO wrong_answers (user_id, question_hash, wrong_count, correct_streak, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(user_id, question_hash) DO UPDATE SET
                wrong_count = excluded.wrong_count,
                correct_streak = excluded.correct_streak,
                updated_at = datetime('now')`
        )
        .run(userId, key, wrong, streak);
}
