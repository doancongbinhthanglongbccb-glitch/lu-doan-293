import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from './connection.js';
import { env } from '../src/config/env.js';
import { DEFAULT_ADMIN } from '../../shared/constants/user.js';
import { replaceQuizData, getQuizData } from '../src/models/quiz.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const db = getDb();
    db.exec(sql);
    console.log('[migrate] Schema applied.');
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

    const hash = bcrypt.hashSync(DEFAULT_ADMIN.password, env.bcryptRounds);
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
        db.prepare('INSERT INTO quiz_meta (id, title) VALUES (1, ?)').run(
            'Hệ thống ôn tập trắc nghiệm'
        );
        console.log('[migrate] Quiz meta initialized.');
    }
}

function seedQuizFromFile() {
    const quiz = getQuizData();
    const hasQuestions = quiz.topics?.some(t => (t.questions || []).length > 0);
    if (hasQuestions) {
        console.log('[migrate] Quiz data already exists, skip seed.');
        return;
    }

    const jsonPath = path.join(__dirname, '..', '..', 'frontend', 'data', 'questions.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('[migrate] No frontend/data/questions.json found, skip quiz seed.');
        return;
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    replaceQuizData(raw);
    const count = raw.topics?.reduce((n, t) => n + (t.questions?.length || 0), 0) || 0;
    console.log(`[migrate] Seeded quiz from questions.json (${count} questions).`);
}

try {
    runSchema();
    seedAdmin();
    seedQuizMeta();
    seedQuizFromFile();
    console.log('[migrate] Done.');
} finally {
    closeDb();
}
