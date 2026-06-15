import { FILTER_MODES, EXAM_MAX_SCORE } from '../../config/index.js';
import { htmlToText } from '../../utils/html.js';
import { hasAnswer, getQuestionTypeLabel, isTextInputType } from '../../core/grading.js';
import { queueTypeset } from '../../ui/mathjax-renderer.js';

/**
 * Render exam result review list with filters.
 */
export class ReviewListRenderer {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
    }

    /**
     * Update filter button labels.
     * @param {Object} counts
     * @param {number} counts.wrong
     * @param {number} counts.correct
     * @param {number} counts.unanswered
     * @param {number} totalCount
     */
    updateFilterLabels(counts, totalCount) {
        const els = {
            fSai: document.getElementById('fSai'),
            fDung: document.getElementById('fDung'),
            fChuaLam: document.getElementById('fChuaLam'),
            fTatCa: document.getElementById('fTatCa')
        };
        if (els.fSai) els.fSai.textContent = `Sai(${counts.wrong})`;
        if (els.fDung) els.fDung.textContent = `Đúng(${counts.correct})`;
        if (els.fChuaLam) els.fChuaLam.textContent = `Chưa làm(${counts.unanswered})`;
        if (els.fTatCa) els.fTatCa.textContent = `Tất cả(${totalCount})`;
    }

    /**
     * Render filtered review cards.
     * @param {Object} params
     * @param {object[]} params.questions
     * @param {Record<number, object>} params.answers
     * @param {string} params.filterMode
     * @param {number} params.totalCount
     */
    render({ questions, answers, filterMode, totalCount }) {
        const ptsPerQ = totalCount > 0 ? EXAM_MAX_SCORE / totalCount : 0;
        const fragment = document.createDocumentFragment();

        questions.forEach((q, i) => {
            const st = answers[i];
            let status = FILTER_MODES.UNANSWERED;
            if (hasAnswer(st)) {
                status = st.isCorrect ? FILTER_MODES.CORRECT : FILTER_MODES.WRONG;
            }
            if (filterMode !== FILTER_MODES.ALL && filterMode !== status) return;

            const card = document.createElement('div');
            card.className = 'review-q-card';
            card.innerHTML = this._buildCardHtml(q, i, st, status, totalCount, ptsPerQ);
            fragment.appendChild(card);
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
        queueTypeset(this.container);
    }

    /**
     * @param {object} q
     * @param {number} i
     * @param {object|undefined} st
     * @param {string} status
     * @param {number} totalCount
     * @param {number} ptsPerQ
     * @returns {string}
     */
    _buildCardHtml(q, i, st, status, totalCount, ptsPerQ) {
        let wm = '';
        if (status === FILTER_MODES.CORRECT) wm = '<div class="watermark correct">✔</div>';
        if (status === FILTER_MODES.WRONG) wm = '<div class="watermark wrong">✘</div>';

        const ptsEarned = status === FILTER_MODES.CORRECT ? ptsPerQ : 0;
        let optHtml = '';
        let userAnsText = '';
        let corAnsText = '';

        if (isTextInputType(q.type)) {
            const userVal = st?.textValue || 'Trống';
            const corAns = q.answers.find(a => a.isCorrect);
            corAnsText = corAns ? htmlToText(corAns.html) : '';
            userAnsText = userVal;
            optHtml =
                '<div class="formatted-answer formatted-user-answer">' +
                (q.type === 'essayquestion'
                    ? `<div style="white-space:pre-wrap;">${userVal}</div>`
                    : `<div>${userVal}</div>`) +
                '</div>';
        } else {
            q.answers.forEach((ans, j) => {
                const isCor = ans.isCorrect;
                const isSel = st?.selected.includes(j);
                let c = 'opt-item';
                if (isCor) c += ' correct selected';
                else if (isSel) c += ' wrong selected';
                const radioStyle = q.type === 'Multipleresponse' ? 'border-radius:4px;' : 'border-radius:50%;';
                const radioInnerStyle = q.type === 'Multipleresponse' ? 'border-radius:2px;' : 'border-radius:50%;';
                optHtml +=
                    `<div class="${c}" style="cursor:default;margin-bottom:5px;padding:8px 12px;">` +
                    `<div class="opt-radio" style="${radioStyle}"><div class="opt-radio-inner" style="${radioInnerStyle}"></div></div>` +
                    `<div class="opt-letter">${ans.letter}.</div><div class="q-content">${ans.html}</div></div>`;
            });
            userAnsText = st?.selected.length > 0 ? st.selected.map(idx => q.answers[idx].letter).join(', ') : 'Trống';
            corAnsText = q.answers
                .filter(a => a.isCorrect)
                .map(a => a.letter)
                .join(', ');
        }

        return (
            wm +
            '<div class="rev-q-container">' +
            '<div class="q-header" style="margin-bottom:10px;">' +
            '<div class="q-badge-wrap" style="align-items:center;">' +
            '<div style="font-weight:bold;font-size:17px;">Câu:</div>' +
            `<div class="q-badge-num">${i + 1}/${totalCount}</div>` +
            `<div class="q-badge-type">${getQuestionTypeLabel(q.type)}</div></div>` +
            `<div class="q-content">${q.contentHtml} <span style="color:#999;font-size:13px;">(${ptsPerQ.toFixed(2)} Điểm)</span></div>` +
            '<div style="clear:both;"></div></div>' +
            `<div class="options-list" style="margin-bottom:15px;">${optHtml}</div>` +
            '<div class="rev-bot" style="justify-content:space-between;">' +
            '<div style="display:flex;gap:20px;flex-wrap:wrap;">' +
            `<div>Đáp Án Của Bạn: <b>${userAnsText}</b></div>` +
            `<div>Đáp Án Đúng: <b style="color:var(--green-accent);">${corAnsText}</b></div></div>` +
            `<div>Điểm: ${ptsEarned.toFixed(2)}/${ptsPerQ.toFixed(2)}</div></div></div></div>`
        );
    }
}
