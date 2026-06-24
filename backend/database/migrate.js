import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from './connection.js';
import { env } from '../src/config/env.js';
import { DEFAULT_ADMIN, MIN_PASSWORD_LENGTH } from '../../shared/constants/user.js';
import { DEFAULT_QUIZ_TITLE } from '../src/config/constants.js';
import { replaceQuizData, getQuizData } from '../src/models/quiz.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const db = getDb();
    db.exec(sql);
    console.log('[migrate] Schema applied.');
}

/** Thêm cột seed_applied cho DB đã tồn tại (SQLite không có IF NOT EXISTS cho ADD COLUMN). */
function ensureQuizMetaSeedFlag() {
    const db = getDb();
    try {
        db.prepare(
            'ALTER TABLE quiz_meta ADD COLUMN seed_applied INTEGER NOT NULL DEFAULT 0'
        ).run();
        console.log('[migrate] Added quiz_meta.seed_applied column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
    }

    const meta = db.prepare('SELECT id, seed_applied FROM quiz_meta WHERE id = 1').get();
    if (!meta) {
        db.prepare(
            'INSERT INTO quiz_meta (id, title, seed_applied) VALUES (1, ?, 0)'
        ).run(DEFAULT_QUIZ_TITLE);
        return;
    }

    const hasBank =
        db.prepare('SELECT COUNT(*) AS n FROM topics').get().n > 0 ||
        db.prepare('SELECT COUNT(*) AS n FROM questions').get().n > 0;

    if (hasBank && !meta.seed_applied) {
        db.prepare('UPDATE quiz_meta SET seed_applied = 1 WHERE id = 1').run();
        console.log('[migrate] Marked existing quiz bank as initialized (no re-seed).');
    }
}

/** Thêm parent_id cho chủ đề 2 cấp. */
function ensureTopicParentIdColumn() {
    const db = getDb();
    try {
        db.prepare('ALTER TABLE topics ADD COLUMN parent_id INTEGER REFERENCES topics(id) ON DELETE CASCADE').run();
        console.log('[migrate] Added topics.parent_id column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
    }
    try {
        db.prepare('CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics(parent_id)').run();
    } catch {
        /* index may exist */
    }
}

function isQuizSeedApplied() {
    const row = getDb().prepare('SELECT seed_applied FROM quiz_meta WHERE id = 1').get();
    return !!row?.seed_applied;
}

function markQuizSeedApplied() {
    getDb().prepare('UPDATE quiz_meta SET seed_applied = 1 WHERE id = 1').run();
}

function seedAdmin() {
    const db = getDb();
    const existing = db
        .prepare('SELECT id FROM users WHERE military_id = ?')
        .get(DEFAULT_ADMIN.militaryId);

    if (existing) {
        console.log('[migrate] Admin already exists, skip seed.');
        return;
    }

    const password = env.adminPassword;
    if (!password) {
        throw new Error(
            '[migrate] ADMIN_PASSWORD is required in backend/.env to seed the initial admin account.'
        );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(
            `[migrate] ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`
        );
    }

    const hash = bcrypt.hashSync(password, env.bcryptRounds);
    const now = new Date().toISOString();

    db.prepare(
        `INSERT INTO users (military_id, full_name, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        DEFAULT_ADMIN.militaryId,
        DEFAULT_ADMIN.fullName,
        hash,
        DEFAULT_ADMIN.role,
        DEFAULT_ADMIN.status,
        now,
        now
    );

    console.log(`[migrate] Seeded admin: ${DEFAULT_ADMIN.militaryId}`);
}

function seedQuizMeta() {
    const db = getDb();
    const row = db.prepare('SELECT id FROM quiz_meta WHERE id = 1').get();
    if (!row) {
        db.prepare('INSERT INTO quiz_meta (id, title, seed_applied) VALUES (1, ?, 0)').run(
            DEFAULT_QUIZ_TITLE
        );
        console.log('[migrate] Quiz meta initialized.');
    }
}

/**
 * Seed mẫu từ questions.json — CHỈ lần đầu cài đặt (seed_applied = 0).
 * Không chạy lại khi admin đã xóa hết câu hỏi rồi redeploy.
 */
function seedQuizFromFile() {
    if (isQuizSeedApplied()) {
        console.log('[migrate] Quiz bank already initialized, skip seed.');
        return;
    }

    const jsonPath = path.join(__dirname, '..', '..', 'frontend', 'data', 'questions.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('[migrate] No frontend/data/questions.json found, skip quiz seed.');
        return;
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    replaceQuizData(raw);
    markQuizSeedApplied();

    const count = raw.topics?.reduce((n, t) => n + (t.questions?.length || 0), 0) || 0;
    console.log(`[migrate] Seeded quiz from questions.json (${count} questions).`);
}

try {
    runSchema();
    ensureQuizMetaSeedFlag();
    ensureTopicParentIdColumn();
    seedAdmin();
    seedQuizMeta();
    seedQuizFromFile();
    console.log('[migrate] Done.');
} finally {
    closeDb();
}
