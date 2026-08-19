import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'quiz-lock-'));
process.env.DB_PATH = path.join(tmpDir, 'cbquiz.db');

const { getDb, closeDb } = await import('../database/connection.js');
const quizController = await import('../src/controllers/quiz.controller.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

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
        CREATE TABLE practice_mixed_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_index INTEGER NOT NULL,
            question_ids TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO quiz_meta (id, title, seed_applied, version) VALUES (1, 'test', 1, 1);
    `);
}

function makeQuestion(hash, content) {
    return {
        hash,
        contentHtml: content,
        type: 'multiplechoice',
        answers: [
            { letter: 'A', html: 'Đúng', isCorrect: true },
            { letter: 'B', html: 'Sai', isCorrect: false }
        ]
    };
}

function createApp() {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.get('/api/quiz', quizController.getQuiz);
    app.put('/api/quiz', quizController.putQuiz);
    app.use(errorHandler);
    return app;
}

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, base: `http://127.0.0.1:${port}` });
        });
    });
}

async function api(base, method, body) {
    const res = await fetch(`${base}/api/quiz`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body != null ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    return { status: res.status, json };
}

function topicHashes(quiz) {
    return (quiz?.topics?.[0]?.questions || []).map(q => q.hash).sort();
}

describe('PUT /quiz optimistic lock', () => {
    /** @type {import('http').Server} */
    let server;
    let base;

    before(async () => {
        setupSchema(getDb());
        ({ server, base } = await listen(createApp()));
        console.log(`[quiz-lock] ${new Date().toISOString()} server ${base}`);
    });

    after(() => {
        return new Promise(resolve => {
            server.close(() => {
                closeDb();
                rmSync(tmpDir, { recursive: true, force: true });
                resolve();
            });
        });
    });

    it('1+2. hai PUT cùng version cũ: lần 1 = 200, lần 2 = 409, GET giữ dữ liệu lần 1', async () => {
        const stamp = new Date().toISOString();
        const got = await api(base, 'GET');
        assert.equal(got.status, 200, JSON.stringify(got.json));
        const version = got.json.data.version;
        assert.equal(version, 1);

        const payloadA = {
            version,
            title: 'Tab A',
            topics: [
                {
                    title: 'Chủ đề A',
                    questions: [makeQuestion('hash-tab-a', 'Câu từ tab A')]
                }
            ]
        };
        const payloadB = {
            version,
            title: 'Tab B stale',
            topics: [
                {
                    title: 'Chủ đề B',
                    questions: [makeQuestion('hash-tab-b', 'Câu từ tab B — không được ghi')]
                }
            ]
        };

        const first = await api(base, 'PUT', payloadA);
        console.log(`[quiz-lock] ${stamp} PUT#1 status=${first.status} version=${first.json?.data?.version}`);
        assert.equal(first.status, 200, JSON.stringify(first.json));
        assert.equal(first.json.data.version, version + 1);
        assert.deepEqual(topicHashes(first.json.data), ['hash-tab-a']);

        const second = await api(base, 'PUT', payloadB);
        console.log(`[quiz-lock] ${stamp} PUT#2 status=${second.status} message=${second.json?.message}`);
        assert.equal(second.status, 409, JSON.stringify(second.json));
        assert.match(String(second.json.message), /tải lại trang/i);

        const after = await api(base, 'GET');
        console.log(
            `[quiz-lock] ${stamp} GET after conflict version=${after.json?.data?.version} hashes=${topicHashes(after.json.data)}`
        );
        assert.equal(after.status, 200);
        assert.equal(after.json.data.version, version + 1);
        assert.equal(after.json.data.title, 'Tab A');
        assert.deepEqual(topicHashes(after.json.data), ['hash-tab-a']);
        assert.equal(
            topicHashes(after.json.data).includes('hash-tab-b'),
            false,
            'payload lần 2 không được lẫn vào DB'
        );
    });

    it('3. lưu tuần tự đúng version mỗi lần — không 409', async () => {
        const stamp = new Date().toISOString();
        const firstGet = await api(base, 'GET');
        assert.equal(firstGet.status, 200);
        let version = firstGet.json.data.version;

        const save1 = await api(base, 'PUT', {
            version,
            title: 'Lần 1',
            topics: [
                {
                    title: 'Chủ đề',
                    questions: [makeQuestion('hash-seq-1', 'Câu 1')]
                }
            ]
        });
        console.log(`[quiz-lock] ${stamp} seq PUT#1 status=${save1.status} version=${save1.json?.data?.version}`);
        assert.equal(save1.status, 200, JSON.stringify(save1.json));
        assert.equal(save1.json.data.version, version + 1);
        version = save1.json.data.version;

        const save2 = await api(base, 'PUT', {
            version,
            title: 'Lần 2',
            topics: [
                {
                    title: 'Chủ đề',
                    questions: [
                        makeQuestion('hash-seq-1', 'Câu 1'),
                        makeQuestion('hash-seq-2', 'Câu 2')
                    ]
                }
            ]
        });
        console.log(`[quiz-lock] ${stamp} seq PUT#2 status=${save2.status} version=${save2.json?.data?.version}`);
        assert.equal(save2.status, 200, JSON.stringify(save2.json));
        assert.equal(save2.json.data.version, version + 1);
        assert.deepEqual(topicHashes(save2.json.data), ['hash-seq-1', 'hash-seq-2']);
    });
});
