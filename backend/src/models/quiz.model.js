import { getDb } from '../../database/connection.js';
import { DEFAULT_QUIZ_TITLE } from '../config/constants.js';
import { runTransaction } from '../utils/transaction.js';
import { sanitizeQuizDataHtml } from '../utils/sanitize-html.js';

/**
 * Tạo hash duy nhất cho câu hỏi (cột hash là UNIQUE toàn DB).
 * @param {number|string} topicId
 * @param {number} qIndex
 * @returns {string}
 */
function makeQuestionHash(topicId, qIndex) {
    const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;
    return `q_${topicId}_${qIndex}_${stamp}`;
}

/**
 * Dùng hash từ client nếu hợp lệ, ngược lại tạo mới.
 * @param {object} q
 * @param {number} topicId
 * @param {number} qIndex
 * @returns {string}
 */
function resolveQuestionHash(q, topicId, qIndex) {
    const hash = q.hash;
    if (hash && typeof hash === 'string' && hash.length >= 8) {
        return hash;
    }
    return makeQuestionHash(topicId, qIndex);
}

/**
 * Insert câu hỏi import — luôn hash mới, retry khi trùng UNIQUE.
 * @param {import('better-sqlite3').Statement} insertQuestion
 * @param {number} topicId
 * @param {object} q
 * @param {number} qIndex
 */
function insertQuestionWithUniqueHash(insertQuestion, topicId, q, qIndex) {
    const type = q.type || 'multiplechoice';
    let hash = makeQuestionHash(topicId, qIndex);
    q.hash = hash;

    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            insertQuestion.run(topicId, hash, type, JSON.stringify(q));
            return;
        } catch (err) {
            if (!err.message?.includes('UNIQUE') || attempt === 4) throw err;
            hash = makeQuestionHash(topicId, qIndex);
            q.hash = hash;
        }
    }
}

/**
 * Upsert câu hỏi khi sync — giữ hash cũ nếu có.
 * @param {object} stmts
 * @param {import('better-sqlite3').Database} db
 * @param {number} topicId
 * @param {object} q
 * @param {number} qIndex
 * @returns {string}
 */
function upsertQuestion(stmts, db, topicId, q, qIndex) {
    const type = q.type || 'multiplechoice';
    let hash = resolveQuestionHash(q, topicId, qIndex);

    for (let attempt = 0; attempt < 5; attempt++) {
        q.hash = hash;
        const payload = JSON.stringify(q);
        try {
            const existing = db.prepare('SELECT id FROM questions WHERE hash = ?').get(hash);
            if (existing) {
                stmts.update.run(topicId, type, payload, hash);
            } else {
                stmts.insert.run(topicId, hash, type, payload);
            }
            return hash;
        } catch (err) {
            if (!err.message?.includes('UNIQUE') || attempt === 4) throw err;
            hash = makeQuestionHash(topicId, qIndex);
        }
    }
    return hash;
}

/**
 * Đồng bộ câu hỏi của một topic (không xóa topic).
 * @param {import('better-sqlite3').Database} db
 * @param {number} topicId
 * @param {object[]} questions
 */
function syncTopicQuestions(db, topicId, questions) {
    const stmts = {
        insert: db.prepare(
            'INSERT INTO questions (topic_id, hash, type, payload) VALUES (?, ?, ?, ?)'
        ),
        update: db.prepare(
            `UPDATE questions SET topic_id = ?, type = ?, payload = ?, updated_at = datetime('now') WHERE hash = ?`
        ),
        delete: db.prepare('DELETE FROM questions WHERE topic_id = ? AND hash = ?')
    };

    const incomingHashes = new Set();
    const list = Array.isArray(questions) ? questions : [];

    list.forEach((q, qIndex) => {
        const hash = upsertQuestion(stmts, db, topicId, q, qIndex);
        incomingHashes.add(hash);
    });

    const existing = db.prepare('SELECT hash FROM questions WHERE topic_id = ?').all(topicId);
    for (const row of existing) {
        if (!incomingHashes.has(row.hash)) {
            stmts.delete.run(topicId, row.hash);
        }
    }
}

/**
 * Load full quiz payload — chủ đề 2 cấp (parent → children) hoặc leaf legacy.
 * @returns {{ title: string, topics: object[] }}
 */
export function getQuizData() {
    const db = getDb();
    const meta = db.prepare('SELECT title FROM quiz_meta WHERE id = 1').get();
    const title = meta?.title || DEFAULT_QUIZ_TITLE;

    const rows = db
        .prepare(
            'SELECT id, title, sort_order, parent_id FROM topics ORDER BY sort_order ASC, id ASC'
        )
        .all();

    const getQuestions = db.prepare(
        `SELECT hash, type, payload FROM questions WHERE topic_id = ? ORDER BY id ASC`
    );

    const loadQuestions = topicId =>
        getQuestions.all(topicId).map(q => {
            try {
                return JSON.parse(q.payload);
            } catch {
                return { hash: q.hash, type: q.type };
            }
        });

    const childRows = rows.filter(r => r.parent_id != null);
    const rootRows = rows.filter(r => r.parent_id == null);

    const topics = rootRows.map(row => {
        const kids = childRows.filter(c => c.parent_id === row.id);
        if (kids.length > 0) {
            return {
                id: row.id,
                title: row.title,
                children: kids.map(c => ({
                    id: c.id,
                    title: c.title,
                    questions: loadQuestions(c.id)
                }))
            };
        }
        return {
            id: row.id,
            title: row.title,
            questions: loadQuestions(row.id)
        };
    });

    return { title, topics };
}

/**
 * Upsert một topic row.
 * @returns {number}
 */
function upsertTopicRow(db, topic, parentId, sortOrder, keptTopicIds) {
    const updateTopic = db.prepare(
        'UPDATE topics SET title = ?, sort_order = ?, parent_id = ? WHERE id = ?'
    );
    const insertTopic = db.prepare(
        'INSERT INTO topics (title, sort_order, parent_id) VALUES (?, ?, ?)'
    );
    const topicExists = db.prepare('SELECT id FROM topics WHERE id = ?');

    const topicTitle = topic.title || 'Chủ đề';
    let topicId;

    if (topic.id && topicExists.get(topic.id)) {
        updateTopic.run(topicTitle, sortOrder, parentId, topic.id);
        topicId = topic.id;
    } else {
        topicId = insertTopic.run(topicTitle, sortOrder, parentId).lastInsertRowid;
    }

    keptTopicIds.add(topicId);
    return topicId;
}

/**
 * Sync quiz bank from frontend payload — hỗ trợ parent/children và leaf legacy.
 * @param {{ title?: string, topics: object[] }} data
 * @returns {{ title: string, topics: object[] }}
 */
export function replaceQuizData(data) {
    if (!Array.isArray(data.topics)) {
        const err = new Error('Thiếu danh sách chủ đề (topics).');
        err.status = 400;
        throw err;
    }

    const db = getDb();
    sanitizeQuizDataHtml(data);
    const title = data.title || DEFAULT_QUIZ_TITLE;
    const topics = data.topics;

    runTransaction(db, () => {
        db.prepare(
            `INSERT INTO quiz_meta (id, title, updated_at, seed_applied) VALUES (1, ?, datetime('now'), 1)
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = datetime('now'), seed_applied = 1`
        ).run(title);

        const existingTopicIds = db.prepare('SELECT id FROM topics').all().map(r => r.id);
        const keptTopicIds = new Set();

        topics.forEach((topic, pIndex) => {
            const hasChildren = Array.isArray(topic.children) && topic.children.length > 0;

            if (hasChildren) {
                const parentId = upsertTopicRow(db, topic, null, pIndex, keptTopicIds);
                topic.children.forEach((child, cIndex) => {
                    const childId = upsertTopicRow(db, child, parentId, cIndex, keptTopicIds);
                    syncTopicQuestions(db, childId, child.questions || []);
                });
            } else {
                const leafId = upsertTopicRow(db, topic, null, pIndex, keptTopicIds);
                syncTopicQuestions(db, leafId, topic.questions || []);
            }
        });

        for (const id of existingTopicIds) {
            if (!keptTopicIds.has(id)) {
                db.prepare('DELETE FROM topics WHERE id = ?').run(id);
            }
        }
    });

    return getQuizData();
}

/**
 * Import questions vào một topic cụ thể (không xóa hết)
 */
export function importQuestionsToTopic(topicId, questions) {
    const db = getDb();
    sanitizeQuizDataHtml({ topics: [{ questions }] });

    const insertQuestion = db.prepare(
        'INSERT INTO questions (topic_id, hash, type, payload) VALUES (?, ?, ?, ?)'
    );

    let added = 0;

    runTransaction(db, () => {
        const topic = db.prepare('SELECT id FROM topics WHERE id = ?').get(topicId);
        if (!topic) {
            const err = new Error('Không tìm thấy chủ đề');
            err.status = 404;
            throw err;
        }

        const hasChildren = db
            .prepare('SELECT 1 FROM topics WHERE parent_id = ? LIMIT 1')
            .get(topicId);
        if (hasChildren) {
            const err = new Error('Nhóm này đã có môn con — hãy chọn môn con để import.');
            err.status = 400;
            throw err;
        }

        questions.forEach((q, qIndex) => {
            insertQuestionWithUniqueHash(insertQuestion, topicId, q, qIndex);
            added++;
        });

        db.prepare('UPDATE quiz_meta SET seed_applied = 1 WHERE id = 1').run();
    });

    return { added, topicId };
}
