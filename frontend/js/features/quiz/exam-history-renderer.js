import { formatElapsedTime } from '../../utils/date.js';
import { escapeAttr } from '../../utils/html.js';

/**
 * @param {string} iso
 * @returns {string}
 */
export function formatExamDate(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return iso;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @param {object} record
 * @returns {string}
 */
export function formatExamScore(record) {
    if (record.score == null) return '—';
    return `${Number(record.score).toFixed(1)}/10`;
}

/**
 * @param {object} record
 * @returns {string}
 */
export function formatAdminBranchLabel(record) {
    if (record.branch === 'mixed') return 'Trộn tổng hợp';
    return record.topicTitle || 'Lĩnh vực';
}

/**
 * Normalize a raw exam history record for display.
 * @param {object} record
 * @returns {object}
 */
export function normalizeExamRecord(record) {
    const detail = record.detail || {};
    const percent =
        record.score != null && record.total > 0
            ? Math.round((record.score / 10) * 100)
            : null;

    return {
        title: record.topicTitle || detail.title || 'Bài kiểm tra',
        modeLabel:
            record.branch === 'mixed'
                ? 'Kiểm tra · Trộn'
                : `Kiểm tra · ${record.topicTitle || 'Lĩnh vực'}`,
        timeLimit: detail.timeLimit || '—',
        scoreText: formatExamScore(record),
        total: record.total ?? '—',
        duration:
            record.durationSec != null ? formatElapsedTime(record.durationSec) : '—',
        percent,
        correct: detail.correct ?? '—',
        wrong: detail.wrong ?? '—',
        unanswered: detail.unanswered ?? '—',
        createdAtText: formatExamDate(record.createdAt),
        militaryId: record.militaryId || '—',
        fullName: record.fullName || '—',
        battalionName: record.battalionName || '—'
    };
}

/**
 * Render admin exam history table rows.
 * @param {HTMLElement} tbody
 * @param {object[]} records
 * @param {string} emptyMessage
 */
export function renderAdminHistoryTable(tbody, records, emptyMessage) {
    tbody.innerHTML = '';

    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">${emptyMessage}</td></tr>`;
        return;
    }

    records.forEach(record => {
        const row = normalizeExamRecord(record);
        const tr = document.createElement('tr');
        tr.innerHTML =
            `<td>${escapeAttr(row.createdAtText)}</td>` +
            `<td><code class="user-id">${escapeAttr(row.militaryId)}</code></td>` +
            `<td>${escapeAttr(row.fullName)}</td>` +
            `<td>${escapeAttr(row.battalionName)}</td>` +
            `<td>${escapeAttr(formatAdminBranchLabel(record))}</td>` +
            `<td><strong>${escapeAttr(row.scoreText)}</strong></td>` +
            `<td>${row.total}</td>` +
            `<td>${escapeAttr(row.duration)}</td>` +
            `<td>${row.correct}</td>` +
            `<td>${row.wrong}</td>` +
            `<td>${row.unanswered}</td>`;
        tbody.appendChild(tr);
    });
}

/**
 * Render exam history list (user card view).
 */
export class ExamHistoryRenderer {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
    }

    /**
     * @param {object[]} records
     * @param {string} [emptyMessage]
     */
    render(records, emptyMessage) {
        if (!records.length) {
            this.container.innerHTML =
                `<p class="exam-history-empty">${escapeAttr(emptyMessage || 'Chưa có bài kiểm tra nào.')}</p>`;
            return;
        }

        const rows = records
            .map(record => {
                const row = normalizeExamRecord(record);

                return (
                    `<article class="exam-history-item">` +
                    `<div class="exam-history-head">` +
                    `<div class="exam-history-title">${escapeAttr(row.title)}</div>` +
                    `<time class="exam-history-date">${escapeAttr(row.createdAtText)}</time>` +
                    `</div>` +
                    `<div class="exam-history-meta">` +
                    `<span class="exam-history-badge">${escapeAttr(row.modeLabel)}</span>` +
                    `<span>Thời gian làm bài: ${escapeAttr(row.timeLimit)}</span>` +
                    `</div>` +
                    `<div class="exam-history-stats">` +
                    `<div class="exam-history-stat highlight">` +
                    `<span class="label">Điểm</span>` +
                    `<span class="value">${escapeAttr(row.scoreText)}</span>` +
                    `</div>` +
                    `<div class="exam-history-stat">` +
                    `<span class="label">Số câu</span>` +
                    `<span class="value">${escapeAttr(String(row.total))}</span>` +
                    `</div>` +
                    `<div class="exam-history-stat">` +
                    `<span class="label">Thời gian</span>` +
                    `<span class="value">${escapeAttr(row.duration)}</span>` +
                    `</div>` +
                    (row.percent != null
                        ? `<div class="exam-history-stat">` +
                          `<span class="label">Tỷ lệ</span>` +
                          `<span class="value">${row.percent}%</span>` +
                          `</div>`
                        : '') +
                    `</div>` +
                    `<div class="exam-history-breakdown">` +
                    `Đúng: <strong>${escapeAttr(String(row.correct))}</strong> · ` +
                    `Sai: <strong>${escapeAttr(String(row.wrong))}</strong> · ` +
                    `Chưa làm: <strong>${escapeAttr(String(row.unanswered))}</strong>` +
                    `</div>` +
                    `</article>`
                );
            })
            .join('');

        this.container.innerHTML = rows;
    }
}
