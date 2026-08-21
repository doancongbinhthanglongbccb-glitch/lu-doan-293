import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'lectures-'));
process.env.DB_PATH = path.join(tmpDir, 'cbquiz.db');
process.env.JWT_SECRET = 'test-secret-change-in-production-min-32-chars';
process.env.AUTH_RATE_LIMIT = '0';
process.env.STORAGE_DRIVER = 'memory';
process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
process.env.STORAGE_ACCESS_KEY = 'test';
process.env.STORAGE_SECRET_KEY = 'test';
process.env.STORAGE_BUCKET = 'lectures';

const { getDb, closeDb } = await import('../database/connection.js');
const { signAccessToken } = await import('../src/utils/jwt.js');
const apiRoutes = (await import('../src/routes/index.js')).default;
const { errorHandler } = await import('../src/middleware/error-handler.js');
const storage = await import('../src/services/storage.service.js');

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'schema.sql');

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

const VIDEO_BODY = {
    title: 'Bài video test',
    description: 'Mô tả',
    type: 'video',
    content_type: 'video/mp4',
    original_name: 'clip.mp4',
    size_bytes: 5
};

describe('Lectures — pending/ready, MIME, battalion IDOR, confirm, delete', () => {
    /** @type {import('http').Server} */
    let server;
    let base;
    let adminToken;
    let userAToken;
    let userBToken;
    const stamp = new Date().toISOString();

    before(async () => {
        const db = getDb();
        db.exec(readFileSync(schemaPath, 'utf8'));
        db.exec(`
            INSERT INTO quiz_meta (id, title, seed_applied, version) VALUES (1, 'Bank test', 1, 1);
            INSERT INTO battalions (id, name, is_active) VALUES (1, 'TD 1', 1);
            INSERT INTO battalions (id, name, is_active) VALUES (2, 'TD 2', 1);
        `);
        const hash = bcrypt.hashSync('x', 4);
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run('00000001', 'Admin', hash, 'admin', 'approved', null);
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run('10000001', 'User A', hash, 'user', 'approved', 1);
        db.prepare(
            `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run('10000002', 'User B', hash, 'user', 'approved', 2);

        adminToken = signAccessToken({ id: 1, militaryId: '00000001', role: 'admin' });
        userAToken = signAccessToken({ id: 2, militaryId: '10000001', role: 'user' });
        userBToken = signAccessToken({ id: 3, militaryId: '10000002', role: 'user' });

        ({ server, base } = await listen(createApp()));
        console.log(`[lectures] ${stamp} server ${base}`);
    });

    after(async () => {
        await new Promise(resolve => server.close(resolve));
        closeDb();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('1. pending lecture is hidden from user list', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'Pending hidden',
            battalion_ids: [1]
        });
        console.log(`[lectures][1] ${stamp} POST /api/lectures`, created.status, created.json);
        assert.equal(created.status, 201);
        const id = created.json.data.id;

        const listed = await api(base, userAToken, 'GET', '/api/lectures');
        console.log(`[lectures][1] ${stamp} GET user list`, listed.status, listed.json);
        assert.equal(listed.status, 200);
        const ids = (listed.json.data.lectures || []).map(l => l.id);
        assert.equal(ids.includes(id), false);

        const adminList = await api(base, adminToken, 'GET', '/api/lectures?status=pending');
        assert.ok((adminList.json.data.lectures || []).some(l => l.id === id && l.status === 'pending'));
    });

    it('2. confirm after object exists → ready, user list sees it', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'Ready after confirm',
            battalion_ids: [1]
        });
        assert.equal(created.status, 201);
        const { id, storage_key } = created.json.data;
        await storage.putObject(storage_key, Buffer.from('hello'), 'video/mp4');

        const confirmed = await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);
        console.log(`[lectures][2] ${stamp} POST confirm`, confirmed.status, confirmed.json);
        assert.equal(confirmed.status, 200);
        assert.equal(confirmed.json.data.lecture.status, 'ready');

        const listed = await api(base, userAToken, 'GET', '/api/lectures');
        console.log(`[lectures][2] ${stamp} GET user list`, listed.status, listed.json);
        assert.equal(listed.status, 200);
        assert.ok((listed.json.data.lectures || []).some(l => l.id === id && l.status === 'ready'));
    });

    it('3. confirm without object → 400, status stays pending', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'No file yet'
        });
        const id = created.json.data.id;

        const confirmed = await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);
        console.log(`[lectures][3] ${stamp} POST confirm missing`, confirmed.status, confirmed.json);
        assert.equal(confirmed.status, 400);
        assert.match(confirmed.json.message, /chưa có trên storage/i);

        const adminList = await api(base, adminToken, 'GET', `/api/lectures`);
        const row = (adminList.json.data.lectures || []).find(l => l.id === id);
        assert.equal(row.status, 'pending');
    });

    it('4. rejected MIME does not create lecture', async () => {
        const before = await api(base, adminToken, 'GET', '/api/lectures');
        const beforeCount = (before.json.data.lectures || []).length;

        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            title: 'Bad mime',
            type: 'document',
            content_type: 'application/zip',
            original_name: 'x.zip'
        });
        console.log(`[lectures][4] ${stamp} POST bad mime`, created.status, created.json);
        assert.equal(created.status, 400);
        assert.equal(created.json.data?.upload_url, undefined);

        const after = await api(base, adminToken, 'GET', '/api/lectures');
        assert.equal((after.json.data.lectures || []).length, beforeCount);
    });

    it('5. GET /:id/url wrong battalion → 403; admin bypasses battalion', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'TD1 only',
            battalion_ids: [1]
        });
        const { id, storage_key } = created.json.data;
        await storage.putObject(storage_key, Buffer.from('hello'), 'video/mp4');
        await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);

        const denied = await api(base, userBToken, 'GET', `/api/lectures/${id}/url`);
        console.log(`[lectures][5] ${stamp} GET url user B`, denied.status, denied.json);
        assert.equal(denied.status, 403);

        const allowed = await api(base, userAToken, 'GET', `/api/lectures/${id}/url`);
        assert.equal(allowed.status, 200);
        assert.ok(allowed.json.data.url);

        const asAdmin = await api(base, adminToken, 'GET', `/api/lectures/${id}/url`);
        console.log(`[lectures][5] ${stamp} GET url admin`, asAdmin.status, asAdmin.json);
        assert.equal(asAdmin.status, 200);
        assert.ok(asAdmin.json.data.url);
    });

    it('6. GET /:id/url while pending → 404, no url', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'Still pending'
        });
        const id = created.json.data.id;

        const res = await api(base, userAToken, 'GET', `/api/lectures/${id}/url`);
        console.log(`[lectures][6] ${stamp} GET url pending`, res.status, res.json);
        assert.equal(res.status, 404);
        assert.equal(res.json.data?.url, undefined);
    });

    it('7. DELETE removes storage object', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'To delete'
        });
        const { id, storage_key } = created.json.data;
        await storage.putObject(storage_key, Buffer.from('hello'), 'video/mp4');
        await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);

        const deleted = await api(base, adminToken, 'DELETE', `/api/lectures/${id}`);
        console.log(`[lectures][7] ${stamp} DELETE`, deleted.status, deleted.json);
        assert.equal(deleted.status, 200);

        const head = await storage.headObject(storage_key);
        assert.equal(head, null);

        const gone = await api(base, adminToken, 'GET', `/api/lectures/${id}/url`);
        assert.equal(gone.status, 404);
    });

    it('8. POST confirm as regular user → 403', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'User cannot confirm'
        });
        const id = created.json.data.id;

        const res = await api(base, userAToken, 'POST', `/api/lectures/${id}/confirm`);
        console.log(`[lectures][8] ${stamp} POST confirm user`, res.status, res.json);
        assert.equal(res.status, 403);
    });

    it('9. POST confirm when already ready → error, no data change', async () => {
        const created = await api(base, adminToken, 'POST', '/api/lectures', {
            ...VIDEO_BODY,
            title: 'Already ready'
        });
        const { id, storage_key } = created.json.data;
        await storage.putObject(storage_key, Buffer.from('hello'), 'video/mp4');
        const first = await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);
        assert.equal(first.status, 200);
        const updatedAt = first.json.data.lecture.updated_at;

        const second = await api(base, adminToken, 'POST', `/api/lectures/${id}/confirm`);
        console.log(`[lectures][9] ${stamp} POST confirm again`, second.status, second.json);
        assert.ok(second.status >= 400);
        assert.match(second.json.message, /sẵn sàng|không cần xác nhận/i);

        const listed = await api(base, adminToken, 'GET', '/api/lectures');
        const row = (listed.json.data.lectures || []).find(l => l.id === id);
        assert.equal(row.status, 'ready');
        assert.equal(row.updated_at, updatedAt);
    });
});
