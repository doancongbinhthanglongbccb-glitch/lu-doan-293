import * as quizModel from '../models/quiz.model.js';
import * as practiceModel from '../models/practice-mixed.model.js';
import { generateExamSets } from './exam-set-generator.service.js';

function err(message, status = 400) {
    const e = new Error(message);
    e.status = status;
    return e;
}

/**
 * Tạo lại N bộ ôn tập tổng hợp dùng chung (engine 3.1).
 * @returns {{ ok: boolean, error?: string, setCount: number }}
 */
export function regenerateSets() {
    const settings = quizModel.getQuizSettings();
    const pool = quizModel.getQuestionPoolIds();
    const generated = generateExamSets(
        pool,
        settings.practiceMixedQuestionCount,
        settings.practiceMixedSetCount
    );

    if (!generated.ok || !generated.sets.length) {
        practiceModel.deleteAllSets();
        return {
            ok: false,
            error: generated.error || 'Không tạo được bộ ôn tập tổng hợp.',
            setCount: 0
        };
    }

    practiceModel.deleteAllSets();
    generated.sets.forEach((ids, index) => {
        practiceModel.insertSet(index + 1, ids);
    });
    return { ok: true, setCount: generated.sets.length };
}

function ensureSetsExist() {
    if (practiceModel.findAllSets().length) return;
    regenerateSets();
}

/**
 * @param {number} userId
 */
export function listSetsForUser(userId) {
    ensureSetsExist();
    const sets = practiceModel.findAllSets();
    const progress = practiceModel.getAnsweredIdsBySet(userId);

    return sets.map(row => {
        const questionIds = practiceModel.questionIdsOf(row);
        const answered = new Set(progress.get(row.id) || []);
        const answeredCount = questionIds.filter(id => answered.has(id)).length;
        return {
            id: row.id,
            setIndex: row.set_index,
            total: questionIds.length,
            answered: answeredCount
        };
    });
}

/**
 * @param {number} setId
 */
export function getSetQuestions(setId) {
    const row = practiceModel.findSetById(setId);
    if (!row) throw err('Không tìm thấy bộ ôn tập.', 404);
    const ids = practiceModel.questionIdsOf(row);
    const questions = quizModel.getQuestionsByDbIds(ids);
    if (!questions.length) throw err('Bộ ôn tập không còn câu hỏi hợp lệ.');
    return {
        id: row.id,
        setIndex: row.set_index,
        title: `Ôn tập tổng hợp — Bộ ${row.set_index}`,
        questions
    };
}

/**
 * @param {number} userId
 * @param {number} setId
 * @param {number[]} questionIds
 */
export function recordProgress(userId, setId, questionIds) {
    const row = practiceModel.findSetById(setId);
    if (!row) throw err('Không tìm thấy bộ ôn tập.', 404);

    const allowed = new Set(practiceModel.questionIdsOf(row));
    const incoming = (questionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && allowed.has(n));

    const merged = new Set(practiceModel.getAnsweredIds(userId, setId));
    incoming.forEach(id => merged.add(id));
    const answeredIds = [...merged];
    practiceModel.upsertAnsweredIds(userId, setId, answeredIds);

    return {
        id: row.id,
        setIndex: row.set_index,
        total: allowed.size,
        answered: answeredIds.length
    };
}
