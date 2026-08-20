import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'a3-security-'));
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

function makeQuestion(hash, correctLetter) {
    return {
        hash,
        contentHtml: `<p>Câu ${hash}</p>`,
        type: 'multiplechoice',
        answers: [
            { letter: 'A', html: '<p>A</p>', isCorrect: correctLetter === 'A' },
            { letter: 'B', html: '<p>B</p>', isCorrect: correctLetter === 'B' }
        ]
    };
}

function insertQuestion(db, topicId, hash, correctLetter) {
    const payload = JSON.stringify(makeQuestion(hash, correctLetter));
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

describe('A3 — grade-question oracle, wrong-review strip, timer, submit keys', () => {
    /** @type {import('http').Server} */
    let server;
    let base;
    let userAToken;
    let userBToken;
    let userCToken;
    let userDToken;
    let userEToken;
    let userFToken;
    let topicId;
    let sessionId;
    let lateSessionId;
    let setId;
    let lateSetId;
    let mixedSetId;
    let qIdA;
    let qIdB;
    const stamp = new Date().toISOString();

    before(async () => {
        const db = getDb();
        db.exec(readFileSync(schemaPath, 'utf8'));
        db.exec(`
            INSERT INTO quiz_meta (id, title, seed_applied, version) VALUES (1, 'Bank test', 1, 1);
            INSERT INTO battalions (id, name, is_active) VALUES (1, 'TD Test', 1);
        `);
        const hash = bcrypt.hashSync('x', 4);
        const insertUser = db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, 1)`
        );
        insertUser.run('00000001', 'Admin', hash, 'admin', 'approved');
        insertUser.run('10000001', 'User A', hash, 'user', 'approved');
        insertUser.run('10000002', 'User B', hash, 'user', 'approved');
        insertUser.run('10000003', 'User C', hash, 'user', 'approved');
        insertUser.run('10000004', 'User D', hash, 'user', 'approved');
        insertUser.run('10000005', 'User E', hash, 'user', 'approved');
        insertUser.run('10000006', 'User F', hash, 'user', 'approved');

        db.prepare('INSERT INTO topics (id, title, sort_order, parent_id) VALUES (1, ?, 0, NULL)').run(
            'Lĩnh vực A'
        );
        topicId = 1;
        insertQuestion(db, 1, 'hash-a', 'A');
        insertQuestion(db, 1, 'hash-b', 'B');
        qIdA = db.prepare("SELECT id FROM questions WHERE hash = 'hash-a'").get().id;
        qIdB = db.prepare("SELECT id FROM questions WHERE hash = 'hash-b'").get().id;

        const now = Date.now();
        const opens = new Date(now - 60 * 60 * 1000).toISOString();
        const closes = new Date(now + 8 * 60 * 60 * 1000).toISOString();
        const insertSession = db.prepare(
            `INSERT INTO exam_sessions (
                battalion_id, type, questions_per_set, number_of_sets, duration_minutes,
                opens_at, closes_at, status, created_by
             ) VALUES (1, 'topic', 2, 1, 30, ?, ?, 'open', 1)`
        );
        insertSession.run(opens, closes);
        sessionId = db.prepare('SELECT id FROM exam_sessions ORDER BY id DESC LIMIT 1').get().id;
        insertSession.run(opens, closes);
        lateSessionId = db.prepare('SELECT id FROM exam_sessions ORDER BY id DESC LIMIT 1').get().id;

        db.prepare('INSERT INTO exam_session_battalions (session_id, battalion_id) VALUES (?, 1)').run(
            sessionId
        );
        db.prepare('INSERT INTO exam_session_battalions (session_id, battalion_id) VALUES (?, 1)').run(
            lateSessionId
        );

        const qIds = JSON.stringify([qIdA, qIdB]);
        db.prepare(
            `INSERT INTO exam_session_sets (session_id, topic_id, set_index, question_ids)
             VALUES (?, ?, 1, ?)`
        ).run(sessionId, topicId, qIds);
        setId = db.prepare('SELECT id FROM exam_session_sets WHERE session_id = ?').get(sessionId).id;
        db.prepare(
            `INSERT INTO exam_session_sets (session_id, topic_id, set_index, question_ids)
             VALUES (?, ?, 1, ?)`
        ).run(lateSessionId, topicId, qIds);
        lateSetId = db.prepare('SELECT id FROM exam_session_sets WHERE session_id = ?').get(lateSessionId)
            .id;

        db.prepare('INSERT INTO practice_mixed_sets (set_index, question_ids) VALUES (1, ?)').run(qIds);
        mixedSetId = db.prepare('SELECT id FROM practice_mixed_sets').get().id;

        db.prepare(
            `INSERT INTO wrong_answers (user_id, question_hash, wrong_count, correct_streak)
             VALUES (3, 'hash-b', 2, 0)`
        ).run();

        userAToken = signAccessToken({ id: 2, militaryId: '10000001', role: 'user' });
        userBToken = signAccessToken({ id: 3, militaryId: '10000002', role: 'user' });
        userCToken = signAccessToken({ id: 4, militaryId: '10000003', role: 'user' });
        userDToken = signAccessToken({ id: 5, militaryId: '10000004', role: 'user' });
        userEToken = signAccessToken({ id: 6, militaryId: '10000005', role: 'user' });
        userFToken = signAccessToken({ id: 7, militaryId: '10000006', role: 'user' });

        ({ server, base } = await listen(createApp()));
        console.log(`[a3-security] ${stamp} server ${base}`);
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

    it('1. grade-question với câu đang in_progress của chính user → 403, không explanation', async () => {
        const started = await api(base, userAToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        assert.equal(started.status, 200, JSON.stringify(started.json));

        const got = await api(base, userAToken, 'POST', '/api/quiz/grade-question', {
            questionId: qIdA,
            selected: [1]
        });
        const raw = JSON.stringify(got.json);
        console.log(`[a3-security] ${stamp} T1 grade in_progress status=${got.status} body=${raw}`);
        assert.equal(got.status, 403);
        assert.equal(got.json.success, false);
        assert.match(got.json.message || '', /Kiểm tra/i);
        assert.equal(raw.includes('"explanation"'), false);
        assert.equal(jsonHasIsCorrect(got.json), false);
    });

    it('2. grade-question với câu thuộc bộ Ôn tập hợp lệ → vẫn chấm được', async () => {
        const setGot = await api(base, userBToken, 'GET', `/api/quiz/practice-mixed/sets/${mixedSetId}`);
        assert.equal(setGot.status, 200);
        const q = setGot.json.data.questions.find(item => item.hash === 'hash-a') || setGot.json.data.questions[0];

        const right = await api(base, userBToken, 'POST', '/api/quiz/grade-question', {
            questionId: q.dbId,
            selected: [0]
        });
        const rightRaw = JSON.stringify(right.json);
        console.log(`[a3-security] ${stamp} T2 grade practice status=${right.status} body=${rightRaw}`);
        assert.equal(right.status, 200, rightRaw);
        assert.equal(right.json.data.answered, true);
        assert.equal(right.json.data.correct, true);
        assert.equal(rightRaw.includes('"isCorrect"'), false);
        assert.equal(right.json.data.explanation, undefined);
    });

    it('3. wrong-review không chứa isCorrect; POST /wrong-history không tin hash client', async () => {
        const inject = await api(base, userBToken, 'POST', '/api/quiz/wrong-history', {
            wrongHistory: { 'hash-a': 9 },
            correctHistory: {}
        });
        assert.equal(inject.status, 200);
        assert.equal(inject.json.data?.wrongHistory?.['hash-a'], undefined);

        const got = await api(base, userBToken, 'POST', '/api/quiz/wrong-review', {
            minWrongCount: 1,
            count: 10
        });
        const raw = JSON.stringify(got.json);
        const hashes = (got.json.data?.questions || []).map(q => q.hash);
        console.log(`[a3-security] ${stamp} T3 wrong-review status=${got.status} hashes=${JSON.stringify(hashes)}`);
        assert.equal(got.status, 200, raw);
        assert.equal(jsonHasIsCorrect(got.json), false);
        assert.deepEqual(hashes, ['hash-b']);
        assert.equal(hashes.includes('hash-a'), false);
        if (got.json.data.questions[0]?.answers?.[0]) {
            assert.equal(
                Object.prototype.hasOwnProperty.call(got.json.data.questions[0].answers[0], 'isCorrect'),
                false
            );
        }
    });

    it('4. submit khi đã quá duration+buffer hoặc closes_at → 403', async () => {
        const started = await api(base, userCToken, 'POST', `/api/exam/sessions/${lateSessionId}/start`, {
            sessionSetId: lateSetId,
            topicId
        });
        assert.equal(started.status, 200, JSON.stringify(started.json));

        const db = getDb();
        const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        db.prepare(
            `UPDATE exam_assignments SET started_at = ?
             WHERE session_id = ? AND user_id = 4`
        ).run(startedAt, lateSessionId);

        const late = await api(base, userCToken, 'POST', `/api/exam/sessions/${lateSessionId}/submit`, {
            topicId,
            answers: [{ questionId: qIdA, selected: [0] }]
        });
        console.log(`[a3-security] ${stamp} T4 late duration status=${late.status} body=${JSON.stringify(late.json)}`);
        assert.equal(late.status, 403);
        assert.equal(late.json.success, false);
        assert.equal(jsonHasIsCorrect(late.json), false);

        const startedAtOk = new Date().toISOString();
        db.prepare(
            `UPDATE exam_assignments SET started_at = ?
             WHERE session_id = ? AND user_id = 4`
        ).run(startedAtOk, lateSessionId);
        db.prepare('UPDATE exam_sessions SET closes_at = ? WHERE id = ?').run(
            new Date(Date.now() - 1000).toISOString(),
            lateSessionId
        );

        const closed = await api(base, userCToken, 'POST', `/api/exam/sessions/${lateSessionId}/submit`, {
            topicId,
            answers: [{ questionId: qIdA, selected: [0] }]
        });
        console.log(`[a3-security] ${stamp} T4 late closes_at status=${closed.status} body=${JSON.stringify(closed.json)}`);
        assert.equal(closed.status, 403);
        assert.equal(closed.json.success, false);
    });

    it('5. start lại khi in_progress → durationMinutes là thời gian còn lại, không phải đủ 30', async () => {
        const db = getDb();
        const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        db.prepare(
            `UPDATE exam_assignments SET started_at = ?
             WHERE session_id = ? AND user_id = 2 AND status = 'in_progress'`
        ).run(startedAt, sessionId);

        const got = await api(base, userAToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        const remaining = got.json.data?.durationMinutes;
        console.log(`[a3-security] ${stamp} T5 resume remaining=${remaining} status=${got.status}`);
        assert.equal(got.status, 200, JSON.stringify(got.json));
        assert.equal(typeof remaining, 'number');
        assert.ok(remaining < 30, `expected remaining < 30, got ${remaining}`);
        assert.ok(remaining > 18, `expected remaining ~20, got ${remaining}`);
        assert.equal(got.json.data.session.durationMinutes, 30);
        assert.equal(jsonHasIsCorrect(got.json), false);
    });

    it('7. nộp xong khi đợt còn open → grade-question cùng questionId bị từ chối', async () => {
        const started = await api(base, userFToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        assert.equal(started.status, 200, JSON.stringify(started.json));

        const submitted = await api(base, userFToken, 'POST', `/api/exam/sessions/${sessionId}/submit`, {
            topicId,
            answers: [
                { questionId: qIdA, selected: [0] },
                { questionId: qIdB, selected: [0] }
            ]
        });
        assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
        assert.ok(Array.isArray(submitted.json.data.questions));

        const got = await api(base, userFToken, 'POST', '/api/quiz/grade-question', {
            questionId: qIdA,
            selected: [1]
        });
        const raw = JSON.stringify(got.json);
        console.log(`[a3-security] ${stamp} T7 grade after open submit status=${got.status} body=${raw}`);
        assert.equal(got.status, 403);
        assert.equal(got.json.success, false);
        assert.match(got.json.message || '', /Kiểm tra/i);
        assert.equal(raw.includes('"explanation"'), false);
        assert.equal(jsonHasIsCorrect(got.json), false);
    });

    it('6. submit luôn trả đáp án (đợt open hoặc closed)', async () => {
        const startD = await api(base, userDToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        assert.equal(startD.status, 200, JSON.stringify(startD.json));
        const openSubmit = await api(base, userDToken, 'POST', `/api/exam/sessions/${sessionId}/submit`, {
            topicId,
            answers: [
                { questionId: qIdA, selected: [0] },
                { questionId: qIdB, selected: [0] }
            ]
        });
        const openRaw = JSON.stringify(openSubmit.json);
        console.log(`[a3-security] ${stamp} T6 open submit status=${openSubmit.status} body=${openRaw}`);
        assert.equal(openSubmit.status, 200, openRaw);
        assert.equal(openSubmit.json.data.ok, true);
        assert.equal(typeof openSubmit.json.data.score, 'number');
        assert.equal(openSubmit.json.data.total, 2);
        assert.equal(openSubmit.json.data.correct, 1);
        assert.ok(Array.isArray(openSubmit.json.data.questions));
        assert.equal(jsonHasIsCorrect(openSubmit.json), true);

        const startE = await api(base, userEToken, 'POST', `/api/exam/sessions/${sessionId}/start`, {
            sessionSetId: setId,
            topicId
        });
        assert.equal(startE.status, 200, JSON.stringify(startE.json));
        getDb().prepare("UPDATE exam_sessions SET status = 'closed' WHERE id = ?").run(sessionId);

        const closedSubmit = await api(base, userEToken, 'POST', `/api/exam/sessions/${sessionId}/submit`, {
            topicId,
            answers: [
                { questionId: qIdA, selected: [0] },
                { questionId: qIdB, selected: [1] }
            ]
        });
        const closedRaw = JSON.stringify(closedSubmit.json);
        console.log(`[a3-security] ${stamp} T6 closed submit status=${closedSubmit.status} hasIsCorrect=${jsonHasIsCorrect(closedSubmit.json)}`);
        assert.equal(closedSubmit.status, 200, closedRaw);
        assert.equal(closedSubmit.json.data.correct, 2);
        assert.ok(Array.isArray(closedSubmit.json.data.questions));
        assert.equal(jsonHasIsCorrect(closedSubmit.json), true);
    });

    it('8. đợt closed → grade-question cùng questionId đã nộp được phép xem đáp án', async () => {
        const got = await api(base, userFToken, 'POST', '/api/quiz/grade-question', {
            questionId: qIdA,
            selected: [1]
        });
        const raw = JSON.stringify(got.json);
        console.log(`[a3-security] ${stamp} T8 grade after session closed status=${got.status} body=${raw}`);
        assert.equal(got.status, 200, raw);
        assert.equal(got.json.data.answered, true);
        assert.equal(got.json.data.correct, false);
        assert.equal(raw.includes('"isCorrect"'), false);
        assert.ok(got.json.data.explanation);
        assert.deepEqual(got.json.data.explanation.correctIndexes, [0]);
    });
});
