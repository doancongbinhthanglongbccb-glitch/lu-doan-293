import { getDb } from '../../database/connection.js';
import {
    DEFAULT_QUIZ_TITLE,
    DEFAULT_PRACTICE_MIXED_QUESTION_COUNT,
    DEFAULT_PRACTICE_MIXED_SET_COUNT,
    DEFAULT_EXAM_TIME_BUFFER_MINUTES,
    TOPIC_TREE_MAX_DEPTH
} from '../config/constants.js';
import { runTransaction } from '../utils/transaction.js';
import { sanitizeQuizDataHtml } from '../utils/sanitize-html.js';

/**
 * CTE cộng dồn câu hỏi của topic + mọi con/cháu, cắt ở TOPIC_TREE_MAX_DEPTH.
 * Export để test dùng đúng SQL production.
 */
export const QUESTION_POOL_CTE = `WITH RECURSIVE subtree AS (
    SELECT id, 1 AS depth FROM topics WHERE id = ?
    UNION ALL
    SELECT t.id, s.depth + 1 FROM topics t
    INNER JOIN subtree s ON t.parent_id = s.id
    WHERE s.depth < ${TOPIC_TREE_MAX_DEPTH}
 )
 SELECT q.id FROM questions q
 WHERE q.topic_id IN (SELECT id FROM subtree)
 ORDER BY q.id ASC`;

/**
 * Gán parentId cho topicId có tạo chu trình không (kể cả tự trỏ).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} topicId
 * @param {number|null} parentId
 * @returns {boolean}
 */
export function parentAssignmentWouldCycle(db, topicId, parentId) {
    if (parentId == null) return false;
    const tid = Number(topicId);
    const pid = Number(parentId);
    if (!Number.isInteger(tid) || !Number.isInteger(pid)) return false;
    if (pid === tid) return true;
    const hit = db
        .prepare(
            `WITH RECURSIVE descendants AS (
                SELECT id, 1 AS depth FROM topics WHERE parent_id = ?
                UNION ALL
                SELECT t.id, d.depth + 1 FROM topics t
                INNER JOIN descendants d ON t.parent_id = d.id
                WHERE d.depth < ?
             )
             SELECT 1 AS hit FROM descendants WHERE id = ? LIMIT 1`
        )
        .get(tid, TOPIC_TREE_MAX_DEPTH, pid);
    return !!hit;
}

function topicTreeError(message) {
    const e = new Error(message);
    e.status = 400;
    return e;
}

/**
 * Payload 2 cấp: trùng id hoặc con.id === cha.id → chu trình khi upsert.
 * @param {object[]} topics
 */
export function quizPayloadWouldCycle(topics) {
    const ids = [];
    for (const topic of topics || []) {
        if (topic.id != null) ids.push(Number(topic.id));
        for (const child of topic.children || []) {
            if (child.id == null) continue;
            const cid = Number(child.id);
            if (topic.id != null && cid === Number(topic.id)) return true;
            ids.push(cid);
        }
    }
    return new Set(ids).size !== ids.length;
}

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
 * @returns {{ practiceMixedQuestionCount: number }}
 */
export function getQuizSettings() {
    const row = getDb()
        .prepare(
            `SELECT practice_mixed_question_count, practice_mixed_set_count, exam_time_buffer_minutes
             FROM quiz_meta WHERE id = 1`
        )
        .get();
    const count = row?.practice_mixed_question_count;
    const setCount = row?.practice_mixed_set_count;
    const buffer = row?.exam_time_buffer_minutes;
    return {
        sharedQuestionCount:
            count > 0 ? count : DEFAULT_PRACTICE_MIXED_QUESTION_COUNT,
        practiceMixedQuestionCount:
            count > 0 ? count : DEFAULT_PRACTICE_MIXED_QUESTION_COUNT,
        practiceMixedSetCount: setCount > 0 ? setCount : DEFAULT_PRACTICE_MIXED_SET_COUNT,
        examTimeBufferMinutes: buffer > 0 ? buffer : DEFAULT_EXAM_TIME_BUFFER_MINUTES
    };
}

/**
 * @param {{ practiceMixedQuestionCount?: number, examTimeBufferMinutes?: number }} data
 * @returns {{ practiceMixedQuestionCount: number, examTimeBufferMinutes: number }}
 */
export function updateQuizSettings(data) {
    const fields = [];
    const values = [];

    const sharedCountInput =
        data.sharedQuestionCount !== undefined
            ? data.sharedQuestionCount
            : data.practiceMixedQuestionCount;
    if (sharedCountInput !== undefined) {
        const count = parseInt(sharedCountInput, 10);
        if (!count || count < 1) {
            const err = new Error('Số câu ôn tập tổng hợp phải là số nguyên dương.');
            err.status = 400;
            throw err;
        }
        fields.push('practice_mixed_question_count = ?');
        values.push(count);
    }

    if (data.practiceMixedSetCount !== undefined) {
        const setCount = parseInt(data.practiceMixedSetCount, 10);
        if (!setCount || setCount < 1) {
            const err = new Error('Số bộ ôn tập tổng hợp phải là số nguyên dương.');
            err.status = 400;
            throw err;
        }
        fields.push('practice_mixed_set_count = ?');
        values.push(setCount);
    }

    if (data.examTimeBufferMinutes !== undefined) {
        const buffer = parseInt(data.examTimeBufferMinutes, 10);
        if (!buffer || buffer < 1) {
            const err = new Error('Buffer thời gian kiểm tra phải là số nguyên dương.');
            err.status = 400;
            throw err;
        }
        fields.push('exam_time_buffer_minutes = ?');
        values.push(buffer);
    }

    if (fields.length === 0) return getQuizSettings();

    const db = getDb();
    const row = db.prepare('SELECT id FROM quiz_meta WHERE id = 1').get();
    if (!row) {
        db.prepare(
            `INSERT INTO quiz_meta (id, title, practice_mixed_question_count, practice_mixed_set_count, exam_time_buffer_minutes)
             VALUES (1, ?, ?, ?, ?)`
        ).run(
            DEFAULT_QUIZ_TITLE,
            sharedCountInput ?? DEFAULT_PRACTICE_MIXED_QUESTION_COUNT,
            data.practiceMixedSetCount ?? DEFAULT_PRACTICE_MIXED_SET_COUNT,
            data.examTimeBufferMinutes ?? DEFAULT_EXAM_TIME_BUFFER_MINUTES
        );
    } else {
        fields.push("updated_at = datetime('now')");
        db.prepare(`UPDATE quiz_meta SET ${fields.join(', ')} WHERE id = 1`).run(...values);
    }

    return getQuizSettings();
}

/**
 * @param {number} topicId
 * @returns {{ id: number, title: string, parent_title: string|null }|null}
 */
export function findLeafTopicById(topicId) {
    const row = getDb()
        .prepare(
            `SELECT t.id, t.title, p.title AS parent_title
             FROM topics t
             LEFT JOIN topics p ON p.id = t.parent_id
             WHERE t.id = ?
               AND NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_id = t.id)`
        )
        .get(topicId);
    return row || null;
}

/**
 * @param {number} topicId
 * @returns {number[]}
 */
export function getQuestionIdsByLeafTopic(topicId) {
    return getDb()
        .prepare('SELECT id FROM questions WHERE topic_id = ? ORDER BY id ASC')
        .all(topicId)
        .map(r => r.id);
}

/**
 * Câu hỏi của `topicId` và mọi node con/cháu. Không truyền topicId = toàn bộ ngân hàng.
 * @param {number|null} topicId
 * @returns {number[]}
 */
export function getQuestionPoolIds(topicId = null) {
    const db = getDb();
    if (!topicId) {
        return db.prepare('SELECT id FROM questions ORDER BY id ASC').all().map(r => r.id);
    }
    return db.prepare(QUESTION_POOL_CTE).all(topicId).map(r => r.id);
}

/**
 * Lĩnh vực = topic gốc (parent_id IS NULL) có ít nhất một câu trong cây con.
 * @returns {{ id: number, title: string }[]}
 */
export function getTopicsWithQuestions() {
    const roots = getDb()
        .prepare(
            `SELECT id, title FROM topics
             WHERE parent_id IS NULL
             ORDER BY sort_order ASC, id ASC`
        )
        .all();
    return roots.filter(root => getQuestionPoolIds(root.id).length > 0);
}

/**
 * @param {number[]} ids
 * @returns {object[]}
 */
export function getQuestionsByDbIds(ids) {
    if (!ids?.length) return [];
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
        .prepare(`SELECT id, hash, type, payload FROM questions WHERE id IN (${placeholders})`)
        .all(...ids);
    const byId = new Map(
        rows.map(r => {
            let payload;
            try {
                payload = JSON.parse(r.payload);
            } catch {
                payload = { hash: r.hash, type: r.type };
            }
            payload.dbId = r.id;
            return [r.id, payload];
        })
    );
    return ids.map(id => byId.get(id)).filter(Boolean);
}

/**
 * @param {string[]} hashes
 * @returns {object[]}
 */
export function getQuestionsByHashes(hashes) {
    if (!hashes?.length) return [];
    const unique = [...new Set(hashes.filter(h => typeof h === 'string' && h.trim()))];
    if (!unique.length) return [];
    const db = getDb();
    const placeholders = unique.map(() => '?').join(',');
    const rows = db
        .prepare(
            `SELECT id, topic_id, hash, type, payload FROM questions WHERE hash IN (${placeholders})`
        )
        .all(...unique);
    return rows.map(r => {
        let payload;
        try {
            payload = JSON.parse(r.payload);
        } catch {
            payload = { hash: r.hash, type: r.type };
        }
        payload.dbId = r.id;
        payload.topicId = r.topic_id;
        if (!payload.hash) payload.hash = r.hash;
        return payload;
    });
}

/**
 * Load full quiz payload — chủ đề 2 cấp (parent → children) hoặc leaf legacy.
 * @returns {{ title: string, topics: object[], settings: object, version: number }}
 */
export function getQuizData() {
    const db = getDb();
    const meta = db.prepare('SELECT title, version FROM quiz_meta WHERE id = 1').get();
    const title = meta?.title || DEFAULT_QUIZ_TITLE;
    const version = meta?.version > 0 ? meta.version : 1;

    const rows = db
        .prepare(
            'SELECT id, title, sort_order, parent_id FROM topics ORDER BY sort_order ASC, id ASC'
        )
        .all();

    const questionRows = db
        .prepare('SELECT topic_id, hash, type, payload FROM questions ORDER BY id ASC')
        .all();
    const questionsByTopic = new Map();
    for (const q of questionRows) {
        let parsed;
        try {
            parsed = JSON.parse(q.payload);
        } catch {
            parsed = { hash: q.hash, type: q.type };
        }
        const list = questionsByTopic.get(q.topic_id);
        if (list) list.push(parsed);
        else questionsByTopic.set(q.topic_id, [parsed]);
    }
    const loadQuestions = topicId => questionsByTopic.get(topicId) || [];

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

    return { title, topics, settings: getQuizSettings(), version };
}

/**
 * Cây chủ đề + số câu — không payload câu, không đáp án.
 * @returns {{ title: string, topics: object[], settings: object, version: number }}
 */
export function getQuizOutline() {
    const db = getDb();
    const meta = db.prepare('SELECT title, version FROM quiz_meta WHERE id = 1').get();
    const title = meta?.title || DEFAULT_QUIZ_TITLE;
    const version = meta?.version > 0 ? meta.version : 1;

    const rows = db
        .prepare(
            'SELECT id, title, sort_order, parent_id FROM topics ORDER BY sort_order ASC, id ASC'
        )
        .all();
    const counts = db
        .prepare('SELECT topic_id, COUNT(*) AS n FROM questions GROUP BY topic_id')
        .all();
    const countByTopic = new Map(counts.map(r => [r.topic_id, r.n]));
    const questionCount = topicId => countByTopic.get(topicId) || 0;

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
                    questionCount: questionCount(c.id)
                }))
            };
        }
        return {
            id: row.id,
            title: row.title,
            questionCount: questionCount(row.id)
        };
    });

    return { title, topics, settings: getQuizSettings(), version };
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
        if (parentAssignmentWouldCycle(db, topic.id, parentId)) {
            throw topicTreeError(
                'Không thể gán chủ đề cha: sẽ tạo vòng lặp trong cây lĩnh vực.'
            );
        }
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
    if (quizPayloadWouldCycle(data.topics)) {
        throw topicTreeError(
            'Cây chủ đề không hợp lệ: trùng id hoặc cha-con tạo vòng lặp.'
        );
    }

    const db = getDb();
    sanitizeQuizDataHtml(data);
    const title = data.title || DEFAULT_QUIZ_TITLE;
    const topics = data.topics;

    runTransaction(
        db,
        () => {
            const currentVersion = db.prepare('SELECT version FROM quiz_meta WHERE id = 1').get()
                ?.version ?? 1;
            const incomingVersion = Number(data.version);
            if (!Number.isInteger(incomingVersion) || incomingVersion !== currentVersion) {
                const err = new Error(
                    'Dữ liệu đã được người khác cập nhật. Vui lòng tải lại trang trước khi lưu.'
                );
                err.status = 409;
                throw err;
            }

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

            db.prepare(
                `UPDATE quiz_meta SET version = version + 1, updated_at = datetime('now') WHERE id = 1`
            ).run();
        },
        { immediate: true }
    );

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

        db.prepare(
            `UPDATE quiz_meta
             SET seed_applied = 1, version = version + 1, updated_at = datetime('now')
             WHERE id = 1`
        ).run();
    });

    return { added, topicId };
}
