import { QUIZ_MODES, LONG_PRESS_MS } from '../../config/index.js';
import { escapeAttr } from '../../utils/html.js';
import {
    getQuestionTypeLabel,
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
        /** @type {Function|null} */
        this.onCheckReview = null;
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
        const typeText = getQuestionTypeLabel(q.type);

        let html =
            '<div class="q-header">' +
            '<div class="q-badge-wrap" style="align-items:center;">' +
            '<div style="font-weight:bold;font-size:15px;">Câu:</div>' +
            `<div class="q-badge-num">${index + 1}/${totalCount}</div>` +
            `<div class="q-badge-type">${typeText}</div>` +
            '</div>' +
            `<div class="q-content">${q.contentHtml}${q.isMul && q.type !== 'Multipleresponse' ? '<i>(Nhiều đáp án)</i>' : ''}</div>` +
            '<div style="clear:both;"></div></div><div class="options-list">';

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
            html += `<div><textarea class="opt-textarea" id="textAns${index}" placeholder="Nhập câu trả lời..." ${disabledStr} aria-label="Câu trả lời">${userVal}</textarea></div>`;
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
        const radioStyle = q.type === 'Multipleresponse' ? 'border-radius:4px;' : 'border-radius:50%;';
        const radioInnerStyle = q.type === 'Multipleresponse' ? 'border-radius:2px;' : 'border-radius:50%;';

        q.answers.forEach((ans, idx) => {
            const isSel = ansState?.selected.includes(idx);
            let c = 'opt-item' + (isSel ? ' selected' : '');
            if (mode === QUIZ_MODES.REVIEW && ansState?.isLocked) {
                if (ans.isCorrect) c += ' correct selected';
                else if (isSel) c += ' wrong selected';
            }
            html +=
                `<div class="${c}" data-idx="${idx}" role="button" tabindex="0" aria-pressed="${isSel}">` +
                `<div class="opt-radio" style="${radioStyle}"><div class="opt-radio-inner" style="${radioInnerStyle}"></div></div>` +
                `<div class="opt-letter">${ans.letter}.</div>` +
                `<div class="q-content">${ans.html}</div></div>`;
        });
        return html;
    }

    /**
     * @param {string} mode
     * @param {object|undefined} ansState
     * @returns {string}
     */
    _renderActionBar(mode, ansState) {
        let html = '<div style="margin-top:15px;display:flex;justify-content:space-between;align-items:center;">';

        if (mode === QUIZ_MODES.EXAM) {
            const isDoubt = ansState?.doubtful;
            const btnColor = isDoubt ? 'var(--primary)' : '#ccc';
            const btnText = isDoubt ? 'Đã đánh dấu nghi ngờ' : 'Đánh dấu nghi ngờ';
            html += `<button id="btnToggleDoubt" type="button" style="padding:8px 15px;font-size:14px;border:1px solid ${btnColor};border-radius:5px;background:${isDoubt ? 'var(--primary)' : 'transparent'};color:${isDoubt ? 'white' : '#666'};cursor:pointer;">&#9873; ${btnText}</button>`;
        } else {
            html += '<div></div>';
        }

        if (mode === QUIZ_MODES.REVIEW && (!ansState || !ansState.isLocked)) {
            html +=
                '<button id="btnCheckReview" type="button" style="padding:10px 20px;font-size:16px;border:none;border-radius:5px;background:var(--blue-accent);color:white;cursor:pointer;">Nộp đáp án</button>';
        } else if (mode === QUIZ_MODES.REVIEW && ansState?.isLocked) {
            html += `<span style="font-size:14px;color:#666;font-weight:500;">${ansState.isCorrect ? '✔ Chính xác' : '✘ Chưa đúng'}</span>`;
        }
        html += '</div>';
        return html;
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

        const btnCheck = document.getElementById('btnCheckReview');
        if (btnCheck) btnCheck.onclick = () => this.onCheckReview?.(q, index);

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
