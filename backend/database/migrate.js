import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from './connection.js';
import { env } from '../src/config/env.js';
import { DEFAULT_ADMIN, MIN_PASSWORD_LENGTH } from '../../shared/constants/user.js';
import { DEFAULT_QUIZ_TITLE, DEFAULT_BATTALION_NAME, DEFAULT_PRACTICE_MIXED_QUESTION_COUNT, DEFAULT_PRACTICE_MIXED_SET_COUNT, DEFAULT_EXAM_TIME_BUFFER_MINUTES } from '../src/config/constants.js';
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

function ensureLectures() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS lectures (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            description     TEXT,
            type            TEXT NOT NULL CHECK(type IN ('video', 'document')),
            storage_key     TEXT NOT NULL,
            original_name   TEXT,
            mime_type       TEXT,
            size_bytes      INTEGER,
            status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'failed')),
            created_by      INTEGER NOT NULL REFERENCES users(id),
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS lecture_battalions (
            lecture_id      INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
            battalion_id    INTEGER NOT NULL REFERENCES battalions(id),
            PRIMARY KEY (lecture_id, battalion_id)
        );
        CREATE INDEX IF NOT EXISTS idx_lecture_battalions_battalion
            ON lecture_battalions(battalion_id);
    `);
    console.log('[migrate] Lecture tables ensured.');
}

function ensureExamSessionBattalions() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS exam_session_battalions (
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            battalion_id    INTEGER NOT NULL REFERENCES battalions(id),
            PRIMARY KEY (session_id, battalion_id)
        );
        CREATE INDEX IF NOT EXISTS idx_exam_session_battalions_battalion
            ON exam_session_battalions(battalion_id);
    `);

    const backfill = db.prepare(
        `INSERT OR IGNORE INTO exam_session_battalions (session_id, battalion_id)
         SELECT id, battalion_id FROM exam_sessions WHERE battalion_id IS NOT NULL`
    ).run();
    if (backfill.changes > 0) {
        console.log(`[migrate] Backfilled exam_session_battalions for ${backfill.changes} session(s).`);
    }
}

function tableHasColumn(table, column) {
    return getDb()
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some(col => col.name === column);
}

function ensureExamSessionSetsV2() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS exam_session_sets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            topic_id        INTEGER REFERENCES topics(id),
            set_index       INTEGER NOT NULL,
            question_ids    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_exam_session_sets_session ON exam_session_sets(session_id);
    `);

    if (tableHasColumn('exam_assignments', 'topic_id')) return;

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
        CREATE TABLE exam_assignments_v2 (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            topic_id        INTEGER REFERENCES topics(id),
            session_set_id  INTEGER REFERENCES exam_session_sets(id),
            question_set    TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'assigned'
                            CHECK(status IN ('assigned', 'in_progress', 'completed')),
            assigned_at     TEXT NOT NULL DEFAULT (datetime('now')),
            started_at      TEXT,
            completed_at    TEXT
        );
        INSERT INTO exam_assignments_v2
            (id, session_id, user_id, topic_id, session_set_id, question_set, status, assigned_at, started_at, completed_at)
        SELECT id, session_id, user_id, NULL, NULL, question_set, status, assigned_at, started_at, completed_at
        FROM exam_assignments;
        DROP TABLE exam_assignments;
        ALTER TABLE exam_assignments_v2 RENAME TO exam_assignments;
        CREATE INDEX IF NOT EXISTS idx_exam_assignments_session ON exam_assignments(session_id);
        CREATE INDEX IF NOT EXISTS idx_exam_assignments_user ON exam_assignments(user_id);

        CREATE TABLE exam_results_v2 (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id   INTEGER REFERENCES exam_assignments(id) ON DELETE SET NULL,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            score           REAL,
            total           INTEGER,
            duration_sec    INTEGER,
            detail          TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO exam_results_v2
            (id, assignment_id, user_id, session_id, score, total, duration_sec, detail, created_at)
        SELECT id, assignment_id, user_id, session_id, score, total, duration_sec, detail, created_at
        FROM exam_results;
        DROP TABLE exam_results;
        ALTER TABLE exam_results_v2 RENAME TO exam_results;
        CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
        CREATE INDEX IF NOT EXISTS idx_exam_results_session ON exam_results(session_id);
    `);
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[migrate] exam_assignments/exam_results upgraded for per-topic sets.');
}

function ensurePracticeMixedSetCount() {
    const db = getDb();
    try {
        db.prepare(
            `ALTER TABLE quiz_meta ADD COLUMN practice_mixed_set_count INTEGER NOT NULL DEFAULT ${DEFAULT_PRACTICE_MIXED_SET_COUNT}`
        ).run();
        console.log('[migrate] Added quiz_meta.practice_mixed_set_count column.');
    } catch (err) {
        if (!String(err.message).includes('duplicate column')) throw err;
    }
}

function ensurePracticeMixedTables() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS practice_mixed_sets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            set_index       INTEGER NOT NULL,
            question_ids    TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS practice_mixed_progress (
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            set_id          INTEGER NOT NULL REFERENCES practice_mixed_sets(id) ON DELETE CASCADE,
            answered_ids    TEXT NOT NULL DEFAULT '[]',
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, set_id)
        );
        CREATE TABLE IF NOT EXISTS practice_topic_progress (
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            topic_id        INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            set_index       INTEGER NOT NULL,
            answered_ids    TEXT NOT NULL DEFAULT '[]',
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, topic_id, set_index)
        );
    `);
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

/** Optimistic lock cho PUT /quiz — DB cũ nhận version = 1. */
function ensureQuizMetaVersion() {
    const db = getDb();
    try {
        db.prepare(
            'ALTER TABLE quiz_meta ADD COLUMN version INTEGER NOT NULL DEFAULT 1'
        ).run();
        console.log('[migrate] Added quiz_meta.version column.');
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

const LEGACY_QUIZ_TITLE = 'Hệ thống ôn tập trắc nghiệm';

function renameDefaultQuizTitle() {
    const db = getDb();
    const row = db.prepare('SELECT title FROM quiz_meta WHERE id = 1').get();
    if (row?.title === LEGACY_QUIZ_TITLE) {
        db.prepare('UPDATE quiz_meta SET title = ? WHERE id = 1').run(DEFAULT_QUIZ_TITLE);
        console.log('[migrate] Updated quiz_meta.title.');
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
    const version =
        getDb().prepare('SELECT version FROM quiz_meta WHERE id = 1').get()?.version ?? 1;
    replaceQuizData({ ...raw, version });
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
    ensurePracticeMixedSetCount();
    ensurePracticeMixedTables();
    ensureExamTables();
    ensureExamSessionSetsV2();
    ensureExamSessionBattalions();
    ensureLectures();
    ensureExamTimeBufferMinutes();
    ensureQuizMetaVersion();
    seedAdmin();
    seedQuizMeta();
    renameDefaultQuizTitle();
    seedQuizFromFile();
    console.log('[migrate] Done.');
} finally {
    closeDb();
}
