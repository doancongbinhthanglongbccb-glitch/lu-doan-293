import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

/**
 * Cùng schema + SQL với practice-mixed.model.js — kiểm tra tiến độ theo user.
 */
function setup(db) {
    db.exec(`
        CREATE TABLE practice_mixed_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_index INTEGER NOT NULL,
            question_ids TEXT NOT NULL
        );
        CREATE TABLE practice_mixed_progress (
            user_id INTEGER NOT NULL,
            set_id INTEGER NOT NULL,
            answered_ids TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (user_id, set_id)
        );
    `);
}

function parseIds(raw) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
}

function insertSet(db, setIndex, questionIds) {
    db.prepare('INSERT INTO practice_mixed_sets (set_index, question_ids) VALUES (?, ?)').run(
        setIndex,
        JSON.stringify(questionIds)
    );
}

function upsertProgress(db, userId, setId, answeredIds) {
    db.prepare(
        `INSERT INTO practice_mixed_progress (user_id, set_id, answered_ids)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, set_id) DO UPDATE SET answered_ids = excluded.answered_ids`
    ).run(userId, setId, JSON.stringify(answeredIds));
}

function getAnsweredIdsBySet(db, userId) {
    const rows = db
        .prepare('SELECT set_id, answered_ids FROM practice_mixed_progress WHERE user_id = ?')
        .all(userId);
    const map = new Map();
    rows.forEach(row => map.set(row.set_id, parseIds(row.answered_ids)));
    return map;
}

function listProgress(db, userId) {
    const sets = db.prepare('SELECT * FROM practice_mixed_sets ORDER BY set_index').all();
    const progress = getAnsweredIdsBySet(db, userId);
    return sets.map(row => {
        const questionIds = parseIds(row.question_ids);
        const answered = new Set(progress.get(row.id) || []);
        return {
            id: row.id,
            answered: questionIds.filter(id => answered.has(id)).length,
            total: questionIds.length
        };
    });
}

describe('ôn tập tổng hợp — tiến độ theo user', () => {
    it('cùng bộ dùng chung: user A không thấy tiến độ user B', () => {
        const db = new DatabaseSync(':memory:');
        setup(db);
        insertSet(db, 1, [10, 20, 30, 40]);
        upsertProgress(db, 1, 1, [10, 20]);
        upsertProgress(db, 2, 1, [30]);

        const a = listProgress(db, 1);
        const b = listProgress(db, 2);
        assert.equal(a[0].answered, 2);
        assert.equal(a[0].total, 4);
        assert.equal(b[0].answered, 1);
        assert.equal(b[0].total, 4);
        db.close();
    });

    it('làm lại cùng câu không cộng dồn trùng (Set merge)', () => {
        const db = new DatabaseSync(':memory:');
        setup(db);
        insertSet(db, 1, [10, 20, 30]);
        const merged = new Set([10, 20]);
        [10, 20, 10].forEach(id => merged.add(id));
        upsertProgress(db, 7, 1, [...merged]);
        assert.equal(listProgress(db, 7)[0].answered, 2);
        db.close();
    });

    it('id không thuộc bộ không được tính vào tiến độ', () => {
        const db = new DatabaseSync(':memory:');
        setup(db);
        insertSet(db, 1, [10, 20]);
        upsertProgress(db, 3, 1, [10, 999]);
        assert.equal(listProgress(db, 3)[0].answered, 1);
        db.close();
    });
});
