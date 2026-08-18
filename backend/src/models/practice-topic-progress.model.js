import { getDb } from '../../database/connection.js';

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

export function getAnsweredIds(userId, topicId, setIndex) {
    const row = getDb()
        .prepare(
            `SELECT answered_ids
             FROM practice_topic_progress
             WHERE user_id = ? AND topic_id = ? AND set_index = ?`
        )
        .get(userId, topicId, setIndex);
    return parseIdList(row?.answered_ids);
}

export function getAnsweredMapByTopic(userId, topicId) {
    const rows = getDb()
        .prepare(
            `SELECT set_index, answered_ids
             FROM practice_topic_progress
             WHERE user_id = ? AND topic_id = ?`
        )
        .all(userId, topicId);
    const map = new Map();
    rows.forEach(row => map.set(row.set_index, parseIdList(row.answered_ids)));
    return map;
}

export function upsertAnsweredIds(userId, topicId, setIndex, answeredIds) {
    getDb()
        .prepare(
            `INSERT INTO practice_topic_progress (user_id, topic_id, set_index, answered_ids, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(user_id, topic_id, set_index) DO UPDATE SET
                answered_ids = excluded.answered_ids,
                updated_at = datetime('now')`
        )
        .run(userId, topicId, setIndex, JSON.stringify(answeredIds));
}
