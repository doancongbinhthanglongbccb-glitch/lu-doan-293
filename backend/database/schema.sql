-- CBQuiz SQLite schema

CREATE TABLE IF NOT EXISTS battalions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    military_id     TEXT NOT NULL UNIQUE CHECK(length(military_id) = 8),
    full_name       TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'user'
                    CHECK(role IN ('admin', 'user')),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'approved', 'rejected')),
    battalion_id    INTEGER REFERENCES battalions(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS quiz_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    title       TEXT NOT NULL DEFAULT 'Hệ thống ôn tập trắc nghiệm',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    seed_applied INTEGER NOT NULL DEFAULT 0,
    practice_mixed_question_count INTEGER NOT NULL DEFAULT 30,
    practice_mixed_set_count INTEGER NOT NULL DEFAULT 5,
    exam_time_buffer_minutes INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS topics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    parent_id   INTEGER REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    hash        TEXT NOT NULL UNIQUE,
    type        TEXT,
    payload     TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);

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

CREATE TABLE IF NOT EXISTS user_quiz_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            TEXT NOT NULL,
    score           REAL,
    total           INTEGER,
    duration_sec    INTEGER,
    detail          TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_history_user ON user_quiz_history(user_id);

CREATE TABLE IF NOT EXISTS wrong_answers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_hash   TEXT NOT NULL,
    wrong_count     INTEGER NOT NULL DEFAULT 0,
    correct_streak  INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_wrong_answers_user ON wrong_answers(user_id);

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

CREATE TABLE IF NOT EXISTS exam_session_battalions (
    session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    battalion_id    INTEGER NOT NULL REFERENCES battalions(id),
    PRIMARY KEY (session_id, battalion_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_session_battalions_battalion ON exam_session_battalions(battalion_id);

CREATE TABLE IF NOT EXISTS exam_session_sets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    topic_id        INTEGER REFERENCES topics(id),
    set_index       INTEGER NOT NULL,
    question_ids    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exam_session_sets_session ON exam_session_sets(session_id);

CREATE TABLE IF NOT EXISTS exam_assignments (
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

CREATE INDEX IF NOT EXISTS idx_exam_assignments_session ON exam_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_user ON exam_assignments(user_id);

CREATE TABLE IF NOT EXISTS exam_results (
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

CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_session ON exam_results(session_id);
