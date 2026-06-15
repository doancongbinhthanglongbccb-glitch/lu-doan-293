import { QUIZ_MODES, REVIEW_SUB_MODES, WRONG_REVIEW_CORRECT_THRESHOLD } from '../config/index.js';
import * as quizRepo from '../storage/quiz-repository.js';

/**
 * Manage wrong/correct answer history per user.
 */
export class WrongHistoryService {
    /**
     * @param {object|null} user
     * @param {Record<string, number>} [wrongHistory]
     * @param {Record<string, number>} [correctHistory]
     */
    constructor(user, wrongHistory = {}, correctHistory = {}) {
        this.user = user;
        this.wrongHistory = { ...wrongHistory };
        this.correctHistory = { ...correctHistory };
    }

    /**
     * Get count of questions in wrong history.
     * @returns {number}
     */
    getWrongCount() {
        return Object.keys(this.wrongHistory).length;
    }

    /**
     * Record answer result and update history.
     * @param {object} question
     * @param {boolean} isCorrect
     * @param {string} mode
     * @param {string} reviewSubMode
     */
    recordAnswer(question, isCorrect, mode, reviewSubMode) {
        const hash = question.hash;
        if (!isCorrect) {
            this.wrongHistory[hash] = (this.wrongHistory[hash] || 0) + 1;
            this.correctHistory[hash] = 0;
        } else if (this.wrongHistory[hash]) {
            this.wrongHistory[hash]--;
            if (mode === QUIZ_MODES.REVIEW && reviewSubMode === REVIEW_SUB_MODES.WRONG) {
                this.correctHistory[hash] = (this.correctHistory[hash] || 0) + 1;
                if (this.correctHistory[hash] >= WRONG_REVIEW_CORRECT_THRESHOLD) {
                    delete this.wrongHistory[hash];
                    delete this.correctHistory[hash];
                }
            }
            if (this.wrongHistory[hash] !== undefined && this.wrongHistory[hash] <= 0) {
                delete this.wrongHistory[hash];
                delete this.correctHistory[hash];
            }
        }
        this.persist();
    }

    /**
     * Filter questions by wrong history threshold.
     * @param {object[]} questions
     * @param {number} minWrongCount
     * @returns {object[]}
     */
    filterWrongQuestions(questions, minWrongCount) {
        return questions.filter(q => this.wrongHistory[q.hash] && this.wrongHistory[q.hash] >= minWrongCount);
    }

    /** Persist to local cache + sync API */
    persist() {
        quizRepo.syncWrongHistoryDebounced(this.user, this.wrongHistory, this.correctHistory);
    }

    /**
     * @returns {{ wrongHistory: Record<string, number>, correctHistory: Record<string, number> }}
     */
    getState() {
        return {
            wrongHistory: this.wrongHistory,
            correctHistory: this.correctHistory
        };
    }
}

/**
 * Create service — load from API, fallback local cache.
 * @param {object|null} user
 * @returns {Promise<WrongHistoryService>}
 */
export async function createWrongHistoryService(user) {
    try {
        const { wrongHistory, correctHistory } = await quizRepo.loadWrongHistoryFromApi(user);
        return new WrongHistoryService(user, wrongHistory, correctHistory);
    } catch (err) {
        console.warn('[wrong-history] API load failed, using local cache:', err.message);
        return new WrongHistoryService(
            user,
            quizRepo.getWrongHistory(user),
            quizRepo.getCorrectHistory(user)
        );
    }
}
