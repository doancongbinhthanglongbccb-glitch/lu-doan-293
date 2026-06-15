import { APP_CONFIG, QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../config/index.js';
import { shuffle } from '../utils/array.js';
import { htmlToText } from '../utils/html.js';
import { assignQuestionHash } from '../utils/hash.js';

/**
 * @typedef {import('../core/store.js').AnswerState} AnswerState
 */

/**
 * @typedef {Object} GradeResult
 * @property {boolean} answered
 * @property {boolean} isCorrect
 */

/**
 * Default answer state for a new question.
 * @returns {AnswerState}
 */
export function emptyAnswerState() {
    return { selected: [], textValue: '', doubtful: false, isLocked: false };
}

/**
 * Check if user has provided an answer.
 * @param {AnswerState|undefined|null} answerState
 * @returns {boolean}
 */
export function hasAnswer(answerState) {
    if (!answerState) return false;
    return (
        (answerState.selected && answerState.selected.length > 0) ||
        !!(answerState.textValue && answerState.textValue.trim())
    );
}

/**
 * Get display label for question type.
 * @param {string} type
 * @returns {string}
 */
export function getQuestionTypeLabel(type) {
    return QUESTION_TYPE_LABELS[type] || 'Trắc Nghiệm';
}

/**
 * Assign letter labels to answer options.
 * @param {object[]} answers
 */
export function assignAnswerLetters(answers) {
    const labels = APP_CONFIG.ANSWER_LABELS;
    answers.forEach((a, i) => {
        if (i < labels.length) a.letter = labels[i];
    });
}

/**
 * Prepare question for quiz session — shuffle answers, assign letters, hash.
 * @param {object} q
 * @returns {object}
 */
export function prepareQuestion(q) {
    if (!q.noShuffle) {
        shuffle(q.answers);
    }
    assignAnswerLetters(q.answers);
    q.isMul = q.answers.filter(a => a.isCorrect).length > 1;
    assignQuestionHash(q);
    return q;
}

/**
 * Count total questions across all topics.
 * @param {object} data
 * @returns {number}
 */
export function countAllQuestions(data) {
    if (!data || !data.topics) return 0;
    return data.topics.reduce((sum, t) => sum + (t.questions ? t.questions.length : 0), 0);
}

/**
 * Flatten all questions from topic structure.
 * @param {object} data
 * @returns {object[]}
 */
export function flattenQuestions(data) {
    if (!data || !data.topics) return [];
    return data.topics.flatMap(t => t.questions || []);
}

/**
 * Mark isMul flag on question list.
 * @param {object[]} questions
 */
export function markQuestionsMul(questions) {
    (questions || []).forEach(q => {
        q.isMul = q.answers.filter(a => a.isCorrect).length > 1;
    });
}

/**
 * Grade a single question answer.
 * @param {object} q - Question object
 * @param {AnswerState|undefined|null} answerState
 * @returns {GradeResult}
 */
export function gradeAnswer(q, answerState) {
    if (!answerState) return { answered: false, isCorrect: false };

    if (q.type === QUESTION_TYPES.FILL_BLANK || q.type === QUESTION_TYPES.ESSAY) {
        if (!answerState.textValue || !answerState.textValue.trim()) {
            return { answered: false, isCorrect: false };
        }
        const corAns = q.answers.find(a => a.isCorrect);
        if (!corAns) return { answered: true, isCorrect: false };
        const corText = htmlToText(corAns.html).toLowerCase();
        const userText = answerState.textValue.trim().toLowerCase();
        return { answered: true, isCorrect: corText === userText };
    }

    if (!answerState.selected || !answerState.selected.length) {
        return { answered: false, isCorrect: false };
    }

    const corIdx = q.answers
        .map((a, j) => (a.isCorrect ? j : -1))
        .filter(j => j !== -1);
    const sel = answerState.selected.slice().sort();
    corIdx.sort();
    return { answered: true, isCorrect: JSON.stringify(sel) === JSON.stringify(corIdx) };
}

/**
 * Generate next available question ID.
 * @param {object} data
 * @returns {number}
 */
export function nextQuestionId(data) {
    let max = 0;
    flattenQuestions(data).forEach(q => {
        if (q.id && q.id > max) max = q.id;
    });
    return max + 1;
}

/**
 * Check if question type uses text input.
 * @param {string} type
 * @returns {boolean}
 */
export function isTextInputType(type) {
    return type === QUESTION_TYPES.FILL_BLANK || type === QUESTION_TYPES.ESSAY;
}

/**
 * Check if question supports multiple selection.
 * @param {object} q
 * @returns {boolean}
 */
export function isMultiSelectType(q) {
    return q.isMul || q.type === QUESTION_TYPES.MULTIPLE_RESPONSE;
}
