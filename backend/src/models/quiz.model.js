import { getDb } from '../../database/connection.js';
import { DEFAULT_QUIZ_TITLE } from '../config/constants.js';
import { runTransaction } from '../utils/transaction.js';

/**
 * Load full quiz payload matching frontend shape.
 * @returns {{ title: string, topics: object[] }}
 */
export function getQuizData() {
    const db = getDb();
    const meta = db.prepare('SELECT title FROM quiz_meta WHERE id = 1').get();
    const title = meta?.title || DEFAULT_QUIZ_TITLE;

    const topics = db
        .prepare('SELECT id, title, sort_order FROM topics ORDER BY sort_order ASC, id ASC')
        .all();

    const getQuestions = db.prepare(
        `SELECT hash, type, payload FROM questions WHERE topic_id = ? ORDER BY id ASC`
    );

    return {
        title,
        topics: topics.map(t => ({
            title: t.title,
            questions: getQuestions.all(t.id).map(q => {
                try {
                    return JSON.parse(q.payload);
                } catch {
                    return { hash: q.hash, type: q.type };
                }
            })
        }))
    };
}

/**
 * Replace entire quiz bank from frontend payload.
 * @param {{ title?: string, topics?: object[] }} data
 * @returns {{ title: string, topics: object[] }}
 */
export function replaceQuizData(data) {
    const db = getDb();
    const title = data.title || DEFAULT_QUIZ_TITLE;
    const topics = Array.isArray(data.topics) ? data.topics : [];

    runTransaction(db, () => {
        db.prepare(
            `INSERT INTO quiz_meta (id, title, updated_at) VALUES (1, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = datetime('now')`
        ).run(title);

        db.prepare('DELETE FROM questions').run();
        db.prepare('DELETE FROM topics').run();

        const insertTopic = db.prepare(
            'INSERT INTO topics (title, sort_order) VALUES (?, ?)'
        );
        const insertQuestion = db.prepare(
            'INSERT INTO questions (topic_id, hash, type, payload) VALUES (?, ?, ?, ?)'
        );

        topics.forEach((topic, index) => {
            const topicResult = insertTopic.run(topic.title || `Chủ đề ${index + 1}`, index);
            const topicId = topicResult.lastInsertRowid;
            const questions = Array.isArray(topic.questions) ? topic.questions : [];

            questions.forEach(q => {
                const hash = q.hash || `q_${topicId}_${Math.random().toString(36).slice(2)}`;
                const type = q.type || 'multiplechoice';
                insertQuestion.run(topicId, hash, type, JSON.stringify(q));
            });
        });
    });
    return getQuizData();
}
