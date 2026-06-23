import { formatElapsedTime } from '../../utils/date.js';

/**
 * Render exam result summary screen.
 */
export class ResultRenderer {
    /**
     * Render result statistics.
     * @param {Object} params
     * @param {string} params.title
     * @param {string} params.timeTotalStr
     * @param {string} params.timeStartStr
     * @param {string} params.timeEndStr
     * @param {number} params.percent
     * @param {string} params.scoreOutOf10
     * @param {number} params.elapsedSec
     */
    renderSummary({
        title,
        timeTotalStr,
        timeStartStr,
        timeEndStr,
        percent,
        scoreOutOf10,
        elapsedSec
    }) {
        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        set('resMainTitle', title);
        set('resSub1', `Điểm: ${scoreOutOf10}/10, Thời gian: ${timeTotalStr}`);
        set('txtTimeStart', timeStartStr);
        set('txtTimeEnd', timeEndStr);
        set('valPercent', `${percent}%`);
        set('valScore', scoreOutOf10);
        set('valTime', formatElapsedTime(elapsedSec));

        const cPercent = document.getElementById('cPercent');
        const cScore = document.getElementById('cScore');
        const cTime = document.getElementById('cTime');
        if (cPercent) cPercent.style.background = `conic-gradient(var(--blue-accent) ${percent}%, #f0f0f0 0%)`;
        if (cScore) cScore.style.background = `conic-gradient(var(--red-accent) ${percent}%, #f0f0f0 0%)`;
        if (cTime) cTime.style.background = 'conic-gradient(var(--green-accent) 100%, #f0f0f0 0%)';
    }
}
