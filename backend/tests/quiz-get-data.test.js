import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'os';
import path from 'path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'quiz-get-'));
process.env.DB_PATH = path.join(tmpDir, 'cbquiz.db');

const { getDb, closeDb } = await import('../database/connection.js');
const { getQuizData } = await import('../src/models/quiz.model.js');

function setupSchema(db) {
    db.exec(`
        CREATE TABLE quiz_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            title TEXT NOT NULL DEFAULT 'test',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            seed_applied INTEGER NOT NULL DEFAULT 0,
            practice_mixed_question_count INTEGER NOT NULL DEFAULT 30,
            practice_mixed_set_count INTEGER NOT NULL DEFAULT 5,
            exam_time_buffer_minutes INTEGER NOT NULL DEFAULT 30,
            version INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            parent_id INTEGER REFERENCES topics(id) ON DELETE CASCADE
        );
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            hash TEXT NOT NULL UNIQUE,
            type TEXT,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO quiz_meta (id, title, seed_applied, version) VALUES (1, 'Ngân hàng', 1, 3);
    `);
}

function insertQuestion(db, topicId, hash, content) {
    const payload = JSON.stringify({
        hash,
        contentHtml: content,
        type: 'multiplechoice',
        answers: [{ letter: 'A', html: 'Đúng', isCorrect: true }]
    });
    db.prepare(
        'INSERT INTO questions (topic_id, hash, type, payload) VALUES (?, ?, ?, ?)'
    ).run(topicId, hash, 'multiplechoice', payload);
}

describe('getQuizData tree grouping', () => {
    before(() => {
        const db = getDb();
        setupSchema(db);
        db.prepare('INSERT INTO topics (id, title, sort_order, parent_id) VALUES (1, ?, 0, NULL)').run(
            'Nhóm lớn'
        );
        db.prepare('INSERT INTO topics (id, title, sort_order, parent_id) VALUES (2, ?, 0, 1)').run(
            'Môn con'
        );
        db.prepare('INSERT INTO topics (id, title, sort_order, parent_id) VALUES (3, ?, 1, NULL)').run(
            'Leaf độc lập'
        );
        insertQuestion(db, 2, 'h-child', 'Câu con');
        insertQuestion(db, 3, 'h-leaf', 'Câu leaf');
    });

    after(() => {
        closeDb();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('parent có children; leaf giữ questions; 1 round-trip không làm lệch hash', () => {
        const quiz = getQuizData();
        assert.equal(quiz.title, 'Ngân hàng');
        assert.equal(quiz.version, 3);
        assert.equal(quiz.topics.length, 2);

        const grouped = quiz.topics[0];
        assert.equal(grouped.title, 'Nhóm lớn');
        assert.equal(grouped.children?.length, 1);
        assert.equal(grouped.children[0].title, 'Môn con');
        assert.deepEqual(
            grouped.children[0].questions.map(q => q.hash),
            ['h-child']
        );
        assert.equal(grouped.questions, undefined);

        const leaf = quiz.topics[1];
        assert.equal(leaf.title, 'Leaf độc lập');
        assert.deepEqual(
            leaf.questions.map(q => q.hash),
            ['h-leaf']
        );
        assert.equal(leaf.children, undefined);
    });
});
