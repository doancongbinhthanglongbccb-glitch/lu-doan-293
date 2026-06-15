import { QUIZ_MODES, FILTER_MODES } from '../config/index.js';

/**
 * @typedef {Object} AnswerState
 * @property {number[]} selected
 * @property {string} textValue
 * @property {boolean} doubtful
 * @property {boolean} isLocked
 * @property {boolean} [isCorrect]
 */

/**
 * @typedef {Object} TimerState
 * @property {number} remaining
 * @property {number} elapsed
 * @property {boolean} isRunning
 * @property {boolean} isPaused
 */

/**
 * @typedef {Object} AppState
 * @property {string|null} mode
 * @property {string|null} reviewSubMode
 * @property {number} currentIndex
 * @property {object|null} originalData
 * @property {{ title: string, questions: object[] }} quizData
 * @property {Record<number, AnswerState>} answers
 * @property {TimerState} timer
 * @property {string} filterMode
 * @property {object|null} currentUser
 * @property {Record<string, number>} wrongHistory
 * @property {Record<string, number>} correctHistory
 * @property {string} timeTotalStr
 * @property {string} timeStartStr
 * @property {string} timeEndStr
 * @property {number} scoreCount
 * @property {number} totalCount
 */

/** @returns {AppState} */
function createInitialState() {
    return {
        mode: null,
        reviewSubMode: null,
        currentIndex: 0,
        originalData: null,
        quizData: { title: '', questions: [] },
        answers: {},
        timer: { remaining: 0, elapsed: 0, isRunning: false, isPaused: false },
        filterMode: FILTER_MODES.ALL,
        currentUser: null,
        wrongHistory: {},
        correctHistory: {},
        timeTotalStr: '',
        timeStartStr: '',
        timeEndStr: '',
        scoreCount: 0,
        totalCount: 0
    };
}

/**
 * Simple immutable-style state store with shallow merge updates.
 */
class Store {
    constructor() {
        /** @type {AppState} */
        this._state = createInitialState();
        /** @type {Set<Function>} */
        this._listeners = new Set();
    }

    /**
     * Get current state snapshot.
     * @returns {AppState}
     */
    getState() {
        return this._state;
    }

    /**
     * Partial state update — shallow merge at top level.
     * @param {Partial<AppState>} partial
     */
    setState(partial) {
        this._state = { ...this._state, ...partial };
        this._notify();
    }

    /**
     * Reset quiz session state while keeping user and original data.
     */
    resetQuizSession() {
        const { originalData, currentUser, wrongHistory, correctHistory } = this._state;
        this._state = {
            ...createInitialState(),
            originalData,
            currentUser,
            wrongHistory,
            correctHistory
        };
        this._notify();
    }

    /**
     * Subscribe to state changes.
     * @param {Function} listener - Called with new state after each update
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _notify() {
        this._listeners.forEach(fn => {
            try {
                fn(this._state);
            } catch (err) {
                console.error('[Store] Listener error:', err);
            }
        });
    }
}

/** Singleton store instance */
export const store = new Store();

export { QUIZ_MODES, FILTER_MODES };
