import { QUIZ_MODES, REVIEW_SUB_MODES } from '../config/index.js';
import { clone, shuffle } from '../utils/array.js';
import { flattenQuestions, prepareQuestion, markQuestionsMul } from '../core/grading.js';
import { listSelectableLeaves } from '../core/topic-tree.js';

/**
 * Pure quiz business logic — no DOM dependencies.
 */
export const QuizEngine = {
    /**
     * Flatten questions from selected topic indexes.
     * @param {object} originalData
     * @param {number[]|null} topicIndexes
     * @returns {object[]}
     */
    getFlatQuestionsFromTopics(originalData, topicIndexes) {
        const leaves = listSelectableLeaves(originalData);
        if (topicIndexes?.length && leaves.length > 1) {
            let allQ = [];
            topicIndexes.forEach(idx => {
                if (leaves[idx]) allQ = allQ.concat(leaves[idx].topic.questions || []);
            });
            return allQ;
        }
        return flattenQuestions(originalData);
    },

    /**
     * Build exam question set.
     * @param {object} originalData
     * @param {number} count
     * @returns {{ title: string, questions: object[] }}
     */
    buildExamSet(originalData, count) {
        let questions = clone(flattenQuestions(originalData));
        shuffle(questions);
        questions = questions.slice(0, Math.min(count, questions.length));
        questions.forEach(q => prepareQuestion(q));
        return { title: originalData.title, questions };
    },

    /**
     * Build general review set.
     * @param {object} originalData
     * @returns {{ title: string, questions: object[] }}
     */
    buildGeneralReviewSet(originalData) {
        const questions = clone(flattenQuestions(originalData));
        markQuestionsMul(questions);
        return { title: originalData.title, questions };
    },

    /**
     * Build topic review set.
     * @param {object} originalData
     * @param {number} topicIndex
     * @returns {{ title: string, questions: object[] }}
     */
    buildTopicReviewSet(originalData, leafIndex) {
        const leaves = listSelectableLeaves(originalData);
        const item = leaves[leafIndex];
        const topic = clone(item?.topic || { title: '', questions: [] });
        markQuestionsMul(topic.questions);
        return { title: item?.label || topic.title, questions: topic.questions || [] };
    },

    /**
     * Build wrong-answer review set.
     * @param {object} originalData
     * @param {object[]} candidateQuestions
     * @param {number} count
     * @returns {object[]}
     */
    buildWrongReviewSet(candidateQuestions, count) {
        let questions = clone(candidateQuestions);
        shuffle(questions);
        questions = questions.slice(0, Math.min(count, questions.length));
        questions.forEach(q => prepareQuestion(q));
        return questions;
    },

    /**
     * Deduplicate questions by hash.
     * @param {object[]} questions
     * @returns {object[]}
     */
    deduplicateByHash(questions) {
        const map = {};
        questions.forEach(q => {
            map[q.hash] = q;
        });
        return Object.values(map);
    },

    /**
     * Build score summary from counts (after grading or from store).
     * @param {number} scoreCount
     * @param {number} totalCount
     * @returns {{ scoreCount: number, totalCount: number, percent: number, scoreOutOf10: string, scoreNumeric: number }}
     */
    summarizeScore(scoreCount, totalCount) {
        const total = totalCount || 0;
        const percent = total > 0 ? Math.round((scoreCount / total) * 100) : 0;
        const scoreOutOf10 = total > 0 ? ((scoreCount / total) * 10).toFixed(1) : '0';
        return {
            scoreCount,
            totalCount: total,
            percent,
            scoreOutOf10,
            scoreNumeric: parseFloat(scoreOutOf10)
        };
    },

    /**
     * Calculate exam score summary.
     * @param {object[]} questions
     * @param {Record<number, object>} answers
     * @param {Function} gradeFn
     * @returns {{ scoreCount: number, totalCount: number, percent: number, scoreOutOf10: string, scoreNumeric: number }}
     */
    calculateScore(questions, answers, gradeFn) {
        let scoreCount = 0;
        const totalCount = questions.length;
        questions.forEach((q, i) => {
            const st = answers[i];
            const grade = gradeFn(q, st);
            if (grade.answered && grade.isCorrect) scoreCount++;
        });
        return this.summarizeScore(scoreCount, totalCount);
    },

    /**
     * Count answers by status for result filters.
     * @param {object[]} questions
     * @param {Record<number, object>} answers
     * @param {Function} hasAnswerFn
     * @returns {{ wrong: number, correct: number, unanswered: number }}
     */
    countByStatus(questions, answers, hasAnswerFn) {
        let wrong = 0;
        let correct = 0;
        let unanswered = 0;
        questions.forEach((q, i) => {
            const st = answers[i];
            if (!hasAnswerFn(st)) unanswered++;
            else if (st.isCorrect) correct++;
            else wrong++;
        });
        return { wrong, correct, unanswered };
    },

    /**
     * Indices of questions without an answer.
     * @param {object[]} questions
     * @param {Record<number, object>} answers
     * @param {Function} hasAnswerFn
     * @returns {number[]}
     */
    getUnansweredIndices(questions, answers, hasAnswerFn) {
        const indices = [];
        questions.forEach((q, i) => {
            if (!hasAnswerFn(answers[i])) indices.push(i);
        });
        return indices;
    },

    QUIZ_MODES,
    REVIEW_SUB_MODES
};
