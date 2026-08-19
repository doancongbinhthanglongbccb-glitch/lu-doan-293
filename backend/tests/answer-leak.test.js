import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'answer-leak-'));
process.env.DB_PATH = path.join(tmpDir, 'cbquiz.db');
process.env.JWT_SECRET = 'test-secret-change-in-production-min-32-chars';
process.env.AUTH_RATE_LIMIT = '0';

const { getDb, closeDb } = await import('../database/connection.js');
const { signAccessToken } = await import('../src/utils/jwt.js');
const apiRoutes = (await import('../src/routes/index.js')).default;
const { errorHandler } = await import('../src/middleware/error-handler.js');

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'schema.sql');

function jsonHasIsCorrect(value) {
    return JSON.stringify(value).includes('"isCorrect"');
}

function makeQuestion(hash, correctLetter, topicLabel) {
    return {
        hash,
        contentHtml: `<p>Câu ${topicLabel} ${hash}</p>`,
        type: 'multiplechoice',
        answers: [
            { letter: 'A', html: '<p>A</p>', isCorrect: correctLetter === 'A' },
            { letter: 'B', html: '<p>B</p>', isCorrect: correctLetter === 'B' }
        ]
    };
}

function insertQuestion(db, topicId, hash, correctLetter) {
    const payload = JSON.stringify(makeQuestion(hash, correctLetter, String(topicId)));
    db.prepare(
        'INSERT INTO questions (topic_id, hash, type, payload) VALUES (?, ?, ?, ?)'
    ).run(topicId, hash, 'multiplechoice', payload);
}

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
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

async function api(base, token, method, urlPath, body) {
    const res = await fetch(`${base}${urlPath}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body != null ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    return { status: res.status, json };
}

describe('P0 answer leak — GET /quiz, outline, exam start, wrong-review', () => {
    /** @type {import('http').Server} */
    let server;
    let base;
    let adminToken;
    let userAToken;
    let userBToken;
    let topicId;
    let sessionId;
    let setId;
    const stamp = new Date().toISOString();

    before(async () => {
        const db = getDb();
        db.exec(readFileSync(schemaPath, 'utf8'));
        db.exec(`
            INSERT INTO quiz_meta (id, title, seed_applied, version) VALUES (1, 'Bank test', 1, 1);
            INSERT INTO battalions (id, name, is_active) VALUES (1, 'TD Test', 1);
        `);
        const hash = bcrypt.hashSync('x', 4);
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, 1)`
        ).run('00000001', 'Admin', hash, 'admin', 'approved');
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, 1)`
        ).run('10000001', 'User A', hash, 'user', 'approved');
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, 1)`
        ).run('10000002', 'User B', hash, 'user', 'approved');

        db.prepare('INSERT INTO topics (id, title, sort_order, parent_id) VALUES (1, ?, 0, NULL)').run(
            'Lĩnh vực A'
        );
        topicId = 1;
        insertQuestion(db, 1, 'hash-a', 'A');
        insertQuestion(db, 1, 'hash-b', 'B');

        db.prepare(
            `INSERT INTO wrong_answers (user_id, question_hash, wrong_count, correct_streak)
             VALUES (2, 'hash-a', 2, 0)`
        ).run();
        db.prepare(
            `INSERT INTO wrong_answers (user_id, question_hash, wrong_count, correct_streak)
             VALUES (3, 'hash-b', 5, 0)`
        ).run();

        const now = Date.now();
        const opens = new Date(now - 60 * 60 * 1000).toISOString();
        const closes = new Date(now + 8 * 60 * 60 * 1000).toISOString();
        db.prepare(
            `INSERT INTO exam_sessions (
                battalion_id, type, questions_per_set, number_of_sets, duration_minutes,
                opens_at, closes_at, status, created_by
             ) VALUES (1, 'topic', 2, 1, 30, ?, ?, 'open', 1)`
        ).run(opens, closes);
        sessionId = db.prepare('SELECT id FROM exam_sessions').get().id;
        db.prepare(
            'INSERT INTO exam_session_battalions (session_id, battalion_id) VALUES (?, 1)'
        ).run(sessionId);
        const qIds = db.prepare('SELECT id FROM questions ORDER BY id').all().map(r => r.id);
        db.prepare(
            `INSERT INTO exam_session_sets (session_id, topic_id, set_index, question_ids)
             VALUES (?, ?, 1, ?)`
        ).run(sessionId, topicId, JSON.stringify(qIds));
        setId = db.prepare('SELECT id FROM exam_session_sets').get().id;

        adminToken = signAccessToken({ id: 1, militaryId: '00000001', role: 'admin' });
        userAToken = signAccessToken({ id: 2, militaryId: '10000001', role: 'user' });
        userBToken = signAccessToken({ id: 3, militaryId: '10000002', role: 'user' });

        ({ server, base } = await listen(createApp()));
        console.log(`[answer-leak] ${stamp} server ${base}`);
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

    it('1. GET /quiz token user thường → 403', async () => {
        const got = await api(base, userAToken, 'GET', '/api/quiz');
        console.log(`[answer-leak] ${stamp} T1 GET /quiz userA status=${got.status} body=${JSON.stringify(got.json)}`);
        assert.equal(got.status, 403);
        assert.equal(got.json.success, false);
    });

    it('2. GET /quiz token admin → 200, vẫn có đáp án (luồng quản trị)', async () => {
        const got = await api(base, adminToken, 'GET', '/api/quiz');
        console.log(
            `[answer-leak] ${stamp} T2 GET /quiz admin status=${got.status} hasIsCorrect=${jsonHasIsCorrect(got.json)}`
        );
        assert.equal(got.status, 200);
        assert.equal(got.json.success, true);
        assert.equal(jsonHasIsCorrect(got.json), true);
        assert.ok(got.json.data.topics?.length);
    });

    it('3. GET /quiz/outline token user → 200, không answers/isCorrect/contentHtml', async () => {
        const got = await api(base, userAToken, 'GET', '/api/quiz/outline');
        const raw = JSON.stringify(got.json);
        console.log(`[answer-leak] ${stamp} T3 GET /outline userA status=${got.status} body=${raw}`);
        assert.equal(got.status, 200);
        assert.equal(got.json.success, true);
        assert.equal(raw.includes('"isCorrect"'), false);
        assert.equal(raw.includes('"answers"'), false);
        assert.equal(raw.includes('"contentHtml"'), false);
        assert.equal(got.json.data.topics[0].questionCount, 2);
        assert.ok(got.json.data.settings);
    });

    it('4. POST /exam/sessions/:id/start → không có isCorrect trong toàn bộ JSON', async () => {
        const got = await api(base, userAToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        const raw = JSON.stringify(got.json);
        console.log(
            `[answer-leak] ${stamp} T4 POST start status=${got.status} hasIsCorrect=${raw.includes('"isCorrect"')} qCount=${got.json.data?.questions?.length}`
        );
        assert.equal(got.status, 200, raw);
        assert.equal(raw.includes('"isCorrect"'), false);
        assert.ok(got.json.data.questions?.length >= 1);
        const firstAns = got.json.data.questions[0].answers[0];
        assert.equal(Object.prototype.hasOwnProperty.call(firstAns, 'isCorrect'), false);
    });

    it('5. POST /quiz/wrong-review user A không lấy được hash-b của user B', async () => {
        const gotA = await api(base, userAToken, 'POST', '/api/quiz/wrong-review', {
            minWrongCount: 1,
            count: 10,
            userId: 3,
            hashes: ['hash-b'],
            topicIds: [topicId]
        });
        const hashesA = (gotA.json.data?.questions || []).map(q => q.hash);
        console.log(
            `[answer-leak] ${stamp} T5 wrong-review A status=${gotA.status} hashes=${JSON.stringify(hashesA)}`
        );
        assert.equal(gotA.status, 200);
        assert.deepEqual(hashesA, ['hash-a']);
        assert.equal(hashesA.includes('hash-b'), false);

        const gotB = await api(base, userBToken, 'POST', '/api/quiz/wrong-review', {
            minWrongCount: 1,
            count: 10
        });
        const hashesB = (gotB.json.data?.questions || []).map(q => q.hash);
        console.log(`[answer-leak] ${stamp} T5 wrong-review B hashes=${JSON.stringify(hashesB)}`);
        assert.deepEqual(hashesB, ['hash-b']);
    });

    it('6. Luồng API chính không 4xx vì đổi endpoint', async () => {
        const outline = await api(base, userAToken, 'GET', '/api/quiz/outline');
        const mixed = await api(base, userAToken, 'GET', '/api/quiz/practice-mixed/sets');
        const topicSets = await api(base, userAToken, 'GET', `/api/quiz/topic-review/${topicId}/sets`);
        const wrong = await api(base, userAToken, 'POST', '/api/quiz/wrong-review', {
            minWrongCount: 1,
            count: 5
        });
        const open = await api(base, userAToken, 'GET', '/api/exam/sessions/open');
        console.log(
            `[answer-leak] ${stamp} T6 outline=${outline.status} mixed=${mixed.status} topicSets=${topicSets.status} wrong=${wrong.status} open=${open.status}`
        );
        assert.equal(outline.status, 200);
        assert.equal(mixed.status, 200);
        assert.equal(topicSets.status, 200);
        assert.equal(wrong.status, 200);
        assert.equal(open.status, 200);
        assert.ok((wrong.json.data.questions || []).length >= 1);
        assert.ok((topicSets.json.data.sets || []).length >= 1);
    });
});
