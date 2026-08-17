import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from './connection.js';
import { env } from '../src/config/env.js';
import { DEFAULT_ADMIN, MIN_PASSWORD_LENGTH } from '../../shared/constants/user.js';
import { DEFAULT_QUIZ_TITLE, DEFAULT_BATTALION_NAME, DEFAULT_PRACTICE_MIXED_QUESTION_COUNT, DEFAULT_EXAM_TIME_BUFFER_MINUTES } from '../src/config/constants.js';
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

/** Bảng battalions + cột users.battalion_id (additive). */
function ensureBattalions() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS battalions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            is_active   INTEGER NOT NULL DEFAULT 1
        );
    `);

    try {
        db.prepare('ALTER TABLE users ADD COLUMN battalion_id INTEGER REFERENCES battalions(id)').run();
        console.log('[migrate] Added users.battalion_id column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
    }

    try {
        db.prepare('CREATE INDEX IF NOT EXISTS idx_users_battalion ON users(battalion_id)').run();
    } catch {
        /* index may exist */
    }

    let defaultBattalion = db
        .prepare('SELECT id FROM battalions WHERE name = ?')
        .get(DEFAULT_BATTALION_NAME);

    if (!defaultBattalion) {
        const result = db
            .prepare('INSERT INTO battalions (name, is_active) VALUES (?, 0)')
            .run(DEFAULT_BATTALION_NAME);
        defaultBattalion = { id: result.lastInsertRowid };
        console.log('[migrate] Created default battalion "' + DEFAULT_BATTALION_NAME + '".');
    }

    const backfill = db
        .prepare('UPDATE users SET battalion_id = ? WHERE battalion_id IS NULL')
        .run(defaultBattalion.id);
    if (backfill.changes > 0) {
        console.log(`[migrate] Backfilled battalion_id for ${backfill.changes} user(s).`);
    }
}

/** Cột practice_mixed_question_count cho quiz_meta. */
function ensurePracticeMixedQuestionCount() {
    const db = getDb();
    try {
        db.prepare(
            `ALTER TABLE quiz_meta ADD COLUMN practice_mixed_question_count INTEGER NOT NULL DEFAULT ${DEFAULT_PRACTICE_MIXED_QUESTION_COUNT}`
        ).run();
        console.log('[migrate] Added quiz_meta.practice_mixed_question_count column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
    }

    const meta = db.prepare('SELECT practice_mixed_question_count FROM quiz_meta WHERE id = 1').get();
    if (!meta) return;
    if (!meta.practice_mixed_question_count || meta.practice_mixed_question_count < 1) {
        db.prepare(
            'UPDATE quiz_meta SET practice_mixed_question_count = ? WHERE id = 1'
        ).run(DEFAULT_PRACTICE_MIXED_QUESTION_COUNT);
    }
}

function ensureExamTables() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS exam_sessions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            battalion_id        INTEGER NOT NULL REFERENCES battalions(id),
            type                TEXT NOT NULL CHECK(type IN ('topic', 'mixed')),
            topic_id            INTEGER REFERENCES topics(id),
            questions_per_set   INTEGER NOT NULL,
            number_of_sets      INTEGER NOT NULL,
            duration_minutes    INTEGER NOT NULL,
            opens_at            TEXT NOT NULL,
            closes_at           TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'draft'
                                CHECK(status IN ('draft', 'open', 'closed')),
            needs_regeneration  INTEGER NOT NULL DEFAULT 0,
            created_by          INTEGER NOT NULL REFERENCES users(id),
            created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_exam_sessions_battalion ON exam_sessions(battalion_id);
        CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);

        CREATE TABLE IF NOT EXISTS exam_assignments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_set    TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'assigned'
                            CHECK(status IN ('assigned', 'in_progress', 'completed')),
            assigned_at     TEXT NOT NULL DEFAULT (datetime('now')),
            started_at      TEXT,
            completed_at    TEXT,
            UNIQUE(session_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_exam_assignments_session ON exam_assignments(session_id);
        CREATE INDEX IF NOT EXISTS idx_exam_assignments_user ON exam_assignments(user_id);

        CREATE TABLE IF NOT EXISTS exam_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id   INTEGER NOT NULL REFERENCES exam_assignments(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            score           REAL,
            total           INTEGER,
            duration_sec    INTEGER,
            detail          TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
        CREATE INDEX IF NOT EXISTS idx_exam_results_session ON exam_results(session_id);
    `);
    console.log('[migrate] Exam session tables ensured.');
}

function ensureExamTimeBufferMinutes() {
    const db = getDb();
    try {
        db.prepare(
            `ALTER TABLE quiz_meta ADD COLUMN exam_time_buffer_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_EXAM_TIME_BUFFER_MINUTES}`
        ).run();
        console.log('[migrate] Added quiz_meta.exam_time_buffer_minutes column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
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
        `INSERT INTO users (military_id, full_name, password_hash, role, status, battalion_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        DEFAULT_ADMIN.militaryId,
        DEFAULT_ADMIN.fullName,
        hash,
        DEFAULT_ADMIN.role,
        DEFAULT_ADMIN.status,
        getDefaultBattalionId(),
        now,
        now
    );

    console.log(`[migrate] Seeded admin: ${DEFAULT_ADMIN.militaryId}`);
}

function getDefaultBattalionId() {
    const row = getDb()
        .prepare('SELECT id FROM battalions WHERE name = ?')
        .get(DEFAULT_BATTALION_NAME);
    return row?.id ?? null;
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
    ensureBattalions();
    ensurePracticeMixedQuestionCount();
    ensureExamTables();
    ensureExamTimeBufferMinutes();
    seedAdmin();
    seedQuizMeta();
    seedQuizFromFile();
    console.log('[migrate] Done.');
} finally {
    closeDb();
}
