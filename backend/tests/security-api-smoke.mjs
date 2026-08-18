/**
 * Smoke test bảo mật Giai đoạn 5 — chạy khi server đang lên (npm run dev).
 * Usage: node tests/security-api-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const DB_PATH = join(__dir, '../database/cbquiz.db');

function loadAdminPassword() {
    const envText = readFileSync(join(__dir, '../.env'), 'utf8');
    const m = envText.match(/^ADMIN_PASSWORD=(.+)$/m);
    if (!m) throw new Error('ADMIN_PASSWORD not found in backend/.env');
    return m[1].trim();
}

const ADMIN_PASSWORD = loadAdminPassword();

async function api(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, json, text: JSON.stringify(json) };
}

async function login(militaryId, password) {
    const { status, json } = await api('POST', '/auth/login', {
        body: { militaryId, password }
    });
    if (status !== 200 || !json?.accessToken) {
        throw new Error(`Login failed ${militaryId}: ${status} ${JSON.stringify(json)}`);
    }
    return json.accessToken;
}

function hasNumberOfSets(obj) {
    const s = JSON.stringify(obj);
    return s.includes('numberOfSets') || s.includes('number_of_sets');
}

const results = [];

function record(id, pass, detail) {
    results.push({ id, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${detail}`);
}

async function main() {
    const db = new DatabaseSync(DB_PATH);

    const sessionRow = db
        .prepare(
            `SELECT id, opens_at, closes_at, status FROM exam_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1`
        )
        .get();
    if (!sessionRow) throw new Error('No open exam session in DB — create one first');

    const sessionId = sessionRow.id;
    const setRow = db
        .prepare(
            `SELECT id FROM exam_session_sets WHERE session_id = ? AND topic_id IS NULL ORDER BY set_index LIMIT 1`
        )
        .get(sessionId);
    if (!setRow) throw new Error('No mixed set for open session');

    const userA = db.prepare(`SELECT id, military_id FROM users WHERE military_id = '12345678'`).get();
    const userB = db.prepare(`SELECT id, military_id FROM users WHERE military_id = '00000001'`).get();
    if (!userA || !userB) throw new Error('Need users 12345678 and 00000001');

    const adminToken = await login('00000001', ADMIN_PASSWORD);

    await api('POST', '/users/12345678/reset-password', {
        token: adminToken,
        body: { newPassword: 'TestPass123' }
    });
    const userAToken = await login('12345678', 'TestPass123');

    const batt2 = db.prepare('SELECT id, is_active FROM battalions WHERE id = 2').get();
    const savedOpensAt = sessionRow.opens_at;

    try {
        // ——— Case 1: start blocked when opens_at in future ———
        const futureOpens = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.prepare('UPDATE exam_sessions SET opens_at = ? WHERE id = ?').run(futureOpens, sessionId);

        const startBlocked = await api('POST', `/exam/sessions/${sessionId}/start`, {
            token: userAToken,
            body: { sessionSetId: setRow.id }
        });
        record(
            '1 opens_at future → POST /start blocked',
            startBlocked.status === 400 &&
                (startBlocked.json?.message || '').toLowerCase().includes('chưa'),
            `status=${startBlocked.status} message=${startBlocked.json?.message}`
        );

        db.prepare('UPDATE exam_sessions SET opens_at = ? WHERE id = ?').run(savedOpensAt, sessionId);

        // ——— Case 2: submit ignores client score ———
        const startOk = await api('POST', `/exam/sessions/${sessionId}/start`, {
            token: userAToken,
            body: { sessionSetId: setRow.id }
        });
        if (startOk.status !== 200) {
            record(
                '2 server-side grading (setup start)',
                false,
                `Could not start session for submit test: ${startOk.status} ${startOk.json?.message}`
            );
        } else {
            const questions = startOk.json?.data?.questions || startOk.json?.questions || [];
            const wrongAnswers = questions.map(q => ({
                questionId: q.dbId,
                selected: [999]
            }));
            const submitRes = await api('POST', `/exam/sessions/${sessionId}/submit`, {
                token: userAToken,
                body: {
                    topicId: null,
                    score: 10,
                    total: 999,
                    durationSec: 60,
                    answers: wrongAnswers,
                    detail: { correct: 999, wrong: 0, unanswered: 0 }
                }
            });
            const stored = db
                .prepare(
                    `SELECT score, total, detail FROM exam_results
                     WHERE user_id = ? AND session_id = ?
                     ORDER BY id DESC LIMIT 1`
                )
                .get(userA.id, sessionId);
            const detail = stored?.detail ? JSON.parse(stored.detail) : {};
            const pass =
                submitRes.status === 200 &&
                stored &&
                Number(stored.score) < 5 &&
                Number(stored.total) === questions.length &&
                detail.gradedServerSide === true;
            record(
                '2 fake client score → server recalculates',
                pass,
                `submit status=${submitRes.status} stored score=${stored?.score}/${stored?.total} gradedServerSide=${detail.gradedServerSide}`
            );
        }

        // ——— Case 3: no numberOfSets in soldier payloads ———
        const openRes = await api('GET', '/exam/sessions/open', { token: userAToken });
        const readyRes = await api('GET', `/exam/sessions/${sessionId}/readiness`, {
            token: userAToken
        });
        const leakOpen = hasNumberOfSets(openRes.json);
        const leakReady = hasNumberOfSets(readyRes.json);
        record(
            '3 soldier GET open/readiness hides numberOfSets',
            openRes.status === 200 && readyRes.status === 200 && !leakOpen && !leakReady,
            `open status=${openRes.status} leak=${leakOpen}; readiness status=${readyRes.status} leak=${leakReady}`
        );

        // ——— Case 4: history scoped to token user ———
        const histOwn = await api('GET', '/exam/history', { token: userAToken });
        const histSpoof = await api('GET', `/exam/history?userId=${userB.id}&limit=50`, {
            token: userAToken
        });
        const idsOwn = (histOwn.json?.data?.records || histOwn.json?.records || []).map(r => r.userId);
        const idsSpoof = (histSpoof.json?.data?.records || histSpoof.json?.records || []).map(
            r => r.userId
        );
        const bInSpoof = idsSpoof.some(id => id === userB.id);
        const pass4 =
            histOwn.status === 200 &&
            histSpoof.status === 200 &&
            !bInSpoof &&
            idsSpoof.every(id => id == null || id === userA.id);
        record(
            '4 GET /exam/history ignores userId param (only token user)',
            pass4,
            `userA records=${idsOwn.length}; spoof has userB=${bInSpoof} ids=${JSON.stringify(idsSpoof)}`
        );

        // ——— Case 5: register rejects inactive battalion ———
        db.prepare('UPDATE battalions SET is_active = 0 WHERE id = ?').run(batt2.id);
        const regId = `9${String(Date.now()).slice(-7)}`;
        const regRes = await api('POST', '/auth/register', {
            body: {
                militaryId: regId,
                fullName: 'Security Test User',
                password: 'TestPass123',
                battalionId: batt2.id
            }
        });
        record(
            '5 register inactive battalion → 400',
            regRes.status === 400,
            `status=${regRes.status} message=${regRes.json?.message}`
        );
    } finally {
        db.prepare('UPDATE exam_sessions SET opens_at = ? WHERE id = ?').run(savedOpensAt, sessionId);
        if (batt2) db.prepare('UPDATE battalions SET is_active = ? WHERE id = ?').run(batt2.is_active, batt2.id);
    }

    const failed = results.filter(r => !r.pass);
    console.log('\n=== SUMMARY ===');
    console.log(`${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
        console.error('Failed:', failed.map(f => f.id).join(', '));
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
