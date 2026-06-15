import { eventBus } from './event-bus.js';
import { EVENTS, TIMER_DANGER_SECONDS } from '../config/index.js';

/**
 * Quiz timer with start, pause, resume, and cleanup.
 */
export class TimerService {
    constructor() {
        /** @type {number|null} */
        this._intervalId = null;
        this._remaining = 0;
        this._elapsed = 0;
        this._isPaused = false;
        this._onTick = null;
        this._onExpire = null;
        this._onUpdateUI = null;
    }

    /**
     * Start countdown timer.
     * @param {number} durationSeconds
     * @param {Object} callbacks
     * @param {Function} [callbacks.onTick] - Called each second with { remaining, elapsed }
     * @param {Function} [callbacks.onExpire] - Called when time runs out
     * @param {Function} [callbacks.onUpdateUI] - Called to update display
     */
    start(durationSeconds, { onTick, onExpire, onUpdateUI } = {}) {
        this.stop();
        this._remaining = durationSeconds;
        this._elapsed = 0;
        this._isPaused = false;
        this._onTick = onTick;
        this._onExpire = onExpire;
        this._onUpdateUI = onUpdateUI;

        this._intervalId = setInterval(() => this._tick(), 1000);
        this._updateDisplay();
    }

    /** Pause timer (keeps remaining time). */
    pause() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._isPaused = true;
    }

    /** Resume paused timer. */
    resume() {
        if (!this._isPaused || this._intervalId) return;
        this._isPaused = false;
        this._intervalId = setInterval(() => this._tick(), 1000);
    }

    /** Stop and reset timer. */
    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._isPaused = false;
    }

    /** Alias for stop — use when leaving quiz screen. */
    destroy() {
        this.stop();
        this._onTick = null;
        this._onExpire = null;
        this._onUpdateUI = null;
    }

    /**
     * Get current timer state.
     * @returns {{ remaining: number, elapsed: number, isRunning: boolean, isPaused: boolean }}
     */
    getState() {
        return {
            remaining: this._remaining,
            elapsed: this._elapsed,
            isRunning: !!this._intervalId,
            isPaused: this._isPaused
        };
    }

    /**
     * Format remaining time as MM:SS.
     * @returns {string}
     */
    formatRemaining() {
        const rem = Math.max(0, this._remaining);
        const m = Math.floor(rem / 60)
            .toString()
            .padStart(2, '0');
        const s = (rem % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    /** Whether remaining time is in danger zone */
    isDanger() {
        return this._remaining <= TIMER_DANGER_SECONDS && this._remaining > 0;
    }

    _tick() {
        this._remaining--;
        this._elapsed++;

        if (this._onTick) {
            this._onTick({ remaining: this._remaining, elapsed: this._elapsed });
        }
        eventBus.emit(EVENTS.TIMER_TICK, {
            remaining: this._remaining,
            elapsed: this._elapsed
        });

        this._updateDisplay();

        if (this._remaining <= 0) {
            this.stop();
            eventBus.emit(EVENTS.TIMER_EXPIRED);
            if (this._onExpire) this._onExpire();
        }
    }

    _updateDisplay() {
        if (this._onUpdateUI) {
            this._onUpdateUI({
                text: this.formatRemaining(),
                isDanger: this.isDanger()
            });
        }
    }
}

/** Shared timer instance for quiz */
export const quizTimer = new TimerService();
