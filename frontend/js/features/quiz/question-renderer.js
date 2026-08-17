import { QUIZ_MODES, LONG_PRESS_MS } from '../../config/index.js';
import { escapeAttr } from '../../utils/html.js';
import { sanitizeRichHtml } from '../../utils/sanitize-html.js';
import {
    isTextInputType,
    emptyAnswerState
} from '../../core/grading.js';
import { formatAnswerForDisplay } from '../../services/excel/formatters.js';

/**
 * Render question UI into container element.
 */
export class QuestionRenderer {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
        /** @type {Function|null} */
        this.onOptionClick = null;
        /** @type {Function|null} */
        this.onTextInput = null;
        /** @type {Function|null} */
        this.onToggleDoubt = null;
    }

    /**
     * Render a question.
     * @param {Object} params
     * @param {object} params.question
     * @param {number} params.index
     * @param {number} params.totalCount
     * @param {object|undefined} params.answerState
     * @param {string} params.mode
     */
    render({ question, index, totalCount, answerState, mode }) {
        const q = question;
        const ansState = answerState;

        let html =
            '<div class="q-header">' +
            '<div class="q-badge-wrap">' +
            '<span class="q-badge-label">Câu</span>' +
            `<span class="q-badge-num">${index + 1}/${totalCount}</span>` +
            '</div>' +
            `<div class="q-content">${sanitizeRichHtml(q.contentHtml)}${q.isMul && q.type !== 'Multipleresponse' ? '<span class="q-mul-hint">(Nhiều đáp án)</span>' : ''}</div>` +
            '</div><div class="options-list">';

        if (isTextInputType(q.type)) {
            html += this._renderTextInput(q, index, ansState, mode);
        } else {
            html += this._renderOptions(q, ansState, mode);
        }
        html += '</div>';
        html += this._renderActionBar(mode, ansState);
        this.container.innerHTML = html;
        this._bindEvents(q, index, mode, ansState);
    }

    /**
     * @param {object} q
     * @param {number} index
     * @param {object|undefined} ansState
     * @param {string} mode
     * @returns {string}
     */
    _renderTextInput(q, index, ansState, mode) {
        const userVal = ansState?.textValue || '';
        const disabledStr = mode === QUIZ_MODES.REVIEW && ansState?.isLocked ? 'disabled' : '';
        let html = '';

        if (q.type === 'essayquestion') {
            html += `<div><textarea class="opt-textarea" id="textAns${index}" placeholder="Nhập câu trả lời..." ${disabledStr} aria-label="Câu trả lời">${escapeAttr(userVal)}</textarea></div>`;
        } else {
            html += `<div><input type="text" class="opt-text" value="${escapeAttr(userVal)}" id="textAns${index}" placeholder="Nhập câu trả lời..." ${disabledStr} aria-label="Câu trả lời"></div>`;
        }

        if (mode === QUIZ_MODES.REVIEW && ansState?.isLocked) {
            const corAns = q.answers.find(a => a.isCorrect);
            if (corAns) {
                html +=
                    '<div class="answer-correct-box"><b>Đáp án đúng:</b><div class="formatted-answer">' +
                    formatAnswerForDisplay(corAns.html) +
                    '</div></div>';
            }
        }
        return html;
    }

    /**
     * @param {object} q
     * @param {object|undefined} ansState
     * @param {string} mode
     * @returns {string}
     */
    _renderOptions(q, ansState, mode) {
        let html = '';
        const isMulti = q.type === 'Multipleresponse';
        const shapeClass = isMulti ? 'opt-radio--square' : 'opt-radio--circle';

        q.answers.forEach((ans, idx) => {
            const isSel = ansState?.selected.includes(idx);
            let c = 'opt-item' + (isSel ? ' selected' : '');
            if (mode === QUIZ_MODES.REVIEW && ansState?.isLocked) {
                if (ans.isCorrect) c += ' correct selected';
                else if (isSel) c += ' wrong selected';
            }
            html +=
                `<div class="${c}" data-idx="${idx}" role="button" tabindex="0" aria-pressed="${isSel}">` +
                `<div class="opt-radio ${shapeClass}" aria-hidden="true"><div class="opt-radio-inner"></div></div>` +
                `<span class="opt-letter">${ans.letter}</span>` +
                `<div class="q-content">${sanitizeRichHtml(ans.html)}</div></div>`;
        });
        return html;
    }

    /**
     * @param {string} mode
     * @param {object|undefined} ansState
     * @returns {string}
     */
    _renderActionBar(mode, ansState) {
        if (mode === QUIZ_MODES.EXAM || mode === QUIZ_MODES.CHECK) {
            const isDoubt = ansState?.doubtful;
            const btnClass = isDoubt ? 'btn-flag is-active' : 'btn-flag';
            const btnText = isDoubt ? 'Đã đánh dấu nghi ngờ' : 'Đánh dấu nghi ngờ';
            return (
                '<div class="q-inline-actions">' +
                `<button id="btnToggleDoubt" type="button" class="${btnClass}" aria-pressed="${isDoubt}">` +
                '<svg class="icon-inline" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M5 3v18h2V13h7.2l.8 1.2H21V4h-6.2L14 2.8H7V3H5z"/></svg> ' +
                `${btnText}</button></div>`
            );
        }

        if (mode === QUIZ_MODES.REVIEW && ansState?.isLocked) {
            const ok = ansState.isCorrect;
            return (
                '<div class="q-inline-actions">' +
                `<span class="q-result-badge ${ok ? 'is-correct' : 'is-wrong'}" role="status">` +
                `${ok ? 'Chính xác' : 'Chưa đúng'}</span></div>`
            );
        }

        return '';
    }

  /**
   * @param {object} q
   * @param {number} index
   * @param {string} mode
   * @param {object|undefined} ansState
   */
    _bindEvents(q, index, _mode, _ansState) {
        if (isTextInputType(q.type)) {
            const textEl = document.getElementById(`textAns${index}`);
            if (textEl) {
                textEl.oninput = e => this.onTextInput?.(index, e.target.value);
            }
        }

        const btnDoubt = document.getElementById('btnToggleDoubt');
        if (btnDoubt) btnDoubt.onclick = () => this.onToggleDoubt?.(index);

        this.container.querySelectorAll('.opt-item').forEach(el => {
            const idx = parseInt(el.getAttribute('data-idx'), 10);
            el.onclick = () => this.onOptionClick?.(idx, false);
            el.oncontextmenu = e => {
                e.preventDefault();
                this.onOptionClick?.(idx, true);
                return false;
            };
            el.onkeydown = e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.onOptionClick?.(idx, false);
                }
            };

            let pressTimer;
            el.ontouchstart = () => {
                pressTimer = setTimeout(() => {
                    this.onOptionClick?.(idx, true);
                    pressTimer = null;
                    if (navigator.vibrate) navigator.vibrate(50);
                }, LONG_PRESS_MS);
            };
            el.ontouchend = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };
            el.ontouchcancel = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };
            el.ontouchmove = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };
        });
    }
}

export { emptyAnswerState };
