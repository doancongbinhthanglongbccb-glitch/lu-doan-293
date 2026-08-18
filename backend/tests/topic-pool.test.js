import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { TOPIC_TREE_MAX_DEPTH } from '../src/config/constants.js';
import {
    QUESTION_POOL_CTE,
    parentAssignmentWouldCycle,
    quizPayloadWouldCycle
} from '../src/models/quiz.model.js';

function setupTree(db) {
    db.exec(`
        CREATE TABLE topics (
            id INTEGER PRIMARY KEY,
            title TEXT,
            parent_id INTEGER,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY,
            topic_id INTEGER
        );
    `);
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (1, ?, NULL)').run('Gốc A');
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (2, ?, 1)').run('Con B');
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (3, ?, 2)').run('Cháu C');
    db.prepare('INSERT INTO questions (id, topic_id) VALUES (10, 3)').run();
    db.prepare('INSERT INTO questions (id, topic_id) VALUES (11, 3)').run();
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (4, ?, NULL)').run('Gốc D');
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (5, ?, 4)').run('Con E');
    db.prepare('INSERT INTO questions (id, topic_id) VALUES (20, 4)').run();
    db.prepare('INSERT INTO questions (id, topic_id) VALUES (21, 5)').run();
    db.prepare('INSERT INTO topics (id, title, parent_id) VALUES (6, ?, NULL)').run('Gốc rỗng');
}

function poolOf(db, topicId) {
    return db.prepare(QUESTION_POOL_CTE).all(topicId).map(r => r.id);
}

function rootsWithQuestions(db) {
    const roots = db
        .prepare('SELECT id, title FROM topics WHERE parent_id IS NULL ORDER BY id')
        .all();
    return roots.filter(root => poolOf(db, root.id).length > 0);
}

describe('topic pool CTE (cây 3 cấp)', () => {
    it('gốc không có câu trực tiếp vẫn cộng dồn câu của cháu (cấp 3)', () => {
        const db = new DatabaseSync(':memory:');
        setupTree(db);
        const oneLevelOnly = db
            .prepare('SELECT id FROM questions WHERE topic_id = ?')
            .all(1)
            .map(r => r.id);
        assert.deepEqual(oneLevelOnly, [], 'gốc A không có câu gắn trực tiếp');
        assert.deepEqual(poolOf(db, 1), [10, 11]);
        db.close();
    });

    it('cấp 2 (con) cũng kéo được câu của cháu', () => {
        const db = new DatabaseSync(':memory:');
        setupTree(db);
        assert.deepEqual(poolOf(db, 2), [10, 11]);
        assert.deepEqual(poolOf(db, 3), [10, 11]);
        db.close();
    });

    it('gốc có câu trực tiếp + câu con', () => {
        const db = new DatabaseSync(':memory:');
        setupTree(db);
        assert.deepEqual(poolOf(db, 4), [20, 21]);
        db.close();
    });

    it('danh sách lĩnh vực = chỉ gốc có câu trong cây, không liệt kê con/cháu', () => {
        const db = new DatabaseSync(':memory:');
        setupTree(db);
        const roots = rootsWithQuestions(db);
        assert.deepEqual(
            roots.map(r => r.title),
            ['Gốc A', 'Gốc D']
        );
        db.close();
    });

    it('nhánh không đều (2 cấp + 4 cấp) vẫn gộp hết đáy cây', () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE topics (id INTEGER PRIMARY KEY, parent_id INTEGER);
            CREATE TABLE questions (id INTEGER PRIMARY KEY, topic_id INTEGER);
        `);
        db.prepare('INSERT INTO topics VALUES (1, NULL), (2, 1), (3, 1), (4, 3), (5, 4)').run();
        db.prepare('INSERT INTO questions VALUES (1, 2), (2, 5)').run();
        assert.deepEqual(poolOf(db, 1), [1, 2]);
        db.close();
    });

    it(`chu trình parent_id không treo — cắt ở depth ${TOPIC_TREE_MAX_DEPTH}`, () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE topics (id INTEGER PRIMARY KEY, parent_id INTEGER);
            CREATE TABLE questions (id INTEGER PRIMARY KEY, topic_id INTEGER);
        `);
        db.prepare('INSERT INTO topics VALUES (1, 2), (2, 1)').run();
        db.prepare('INSERT INTO questions VALUES (10, 1)').run();
        const t0 = Date.now();
        const ids = poolOf(db, 1);
        const elapsed = Date.now() - t0;
        assert.ok(elapsed < 2000, `CTE treo ${elapsed}ms`);
        assert.equal(ids[0], 10);
        db.close();
    });
});

describe('chặn chu trình parent_id', () => {
    it('tự trỏ parent_id = chính nó', () => {
        const db = new DatabaseSync(':memory:');
        db.exec('CREATE TABLE topics (id INTEGER PRIMARY KEY, parent_id INTEGER)');
        db.prepare('INSERT INTO topics VALUES (1, NULL)').run();
        assert.equal(parentAssignmentWouldCycle(db, 1, 1), true);
        db.close();
    });

    it('gán cha là con/cháu của chính nó', () => {
        const db = new DatabaseSync(':memory:');
        db.exec('CREATE TABLE topics (id INTEGER PRIMARY KEY, parent_id INTEGER)');
        db.prepare('INSERT INTO topics VALUES (1, NULL), (2, 1), (3, 2)').run();
        assert.equal(parentAssignmentWouldCycle(db, 1, 3), true);
        assert.equal(parentAssignmentWouldCycle(db, 1, null), false);
        assert.equal(parentAssignmentWouldCycle(db, 3, 1), false);
        db.close();
    });

    it('payload PUT: con.id === cha.id hoặc trùng id', () => {
        assert.equal(
            quizPayloadWouldCycle([{ id: 8, children: [{ id: 8, title: 'self' }] }]),
            true
        );
        assert.equal(
            quizPayloadWouldCycle([
                { id: 8, children: [{ id: 11 }] },
                { id: 11, children: [{ id: 12 }] }
            ]),
            true
        );
        assert.equal(
            quizPayloadWouldCycle([{ id: 8, children: [{ id: 11 }] }]),
            false
        );
    });
});
