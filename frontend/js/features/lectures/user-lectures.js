import { $ } from '../../utils/dom.js';
import { escapeAttr } from '../../utils/html.js';
import { formatExamDate } from '../../utils/date.js';
import { showLoading, hideLoading } from '../../ui/loading.js';
import { handleError } from '../../utils/errors.js';
import * as lectureApi from '../../services/lecture.service.js';

const TYPE_LABELS = {
    video: 'Video',
    document: 'Tài liệu'
};

const ICON_VIDEO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M10 10.5v5l5-2.5-5-2.5z"/></svg>';

const ICON_DOC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"/>' +
    '<path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5h5"/></svg>';

/**
 * @param {{ showScreen: (id: string) => void }} deps
 */
export function initUserLectures({ showScreen }) {
    function snippet(text, max = 140) {
        const s = String(text || '').trim();
        if (s.length <= max) return s;
        return `${s.slice(0, max).trim()}…`;
    }

    function dateOnly(iso) {
        const full = formatExamDate(iso);
        return full.split(' ')[0] || full;
    }

    function battalionLabel(row) {
        const names = (row.battalions || []).map(b => b.name).filter(Boolean);
        return names.length ? names.join(', ') : 'Tất cả';
    }

    function renderList(lectures) {
        const container = $('lectureUserList');
        if (!container) return;
        container.replaceChildren();
        if (!lectures.length) {
            const empty = document.createElement('p');
            empty.className = 'lecture-page-kicker';
            empty.textContent = 'Chưa có bài giảng dành cho tiểu đoàn của bạn.';
            container.appendChild(empty);
            return;
        }
        lectures.forEach(row => {
            const isVideo = row.type === 'video';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lecture-card';
            btn.dataset.lectureId = String(row.id);
            const desc = snippet(row.description);
            btn.innerHTML =
                `<span class="lecture-card-icon ${isVideo ? 'is-video' : 'is-document'}">${isVideo ? ICON_VIDEO : ICON_DOC}</span>` +
                `<span class="lecture-card-body">` +
                `<span class="lecture-card-title">${escapeAttr(row.title)}</span>` +
                (desc ? `<span class="lecture-card-desc">${escapeAttr(desc)}</span>` : '') +
                `<span class="lecture-card-meta">` +
                `<span class="lecture-type-badge ${isVideo ? 'is-video' : 'is-document'}">${escapeAttr(TYPE_LABELS[row.type] || row.type)}</span>` +
                `<span>${escapeAttr(battalionLabel(row))}</span>` +
                `<span>${escapeAttr(dateOnly(row.created_at))}</span>` +
                `</span></span>`;
            btn.addEventListener('click', () => openView(row.id));
            container.appendChild(btn);
        });
    }

    async function openList() {
        showLoading('Đang tải bài giảng...');
        try {
            const lectures = await lectureApi.listLectures();
            renderList(lectures);
            showScreen('screenLectures');
        } catch (err) {
            handleError(err, { context: 'UserLectures.list', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    function renderView(meta, playback) {
        const titleEl = $('lectureViewTitle');
        const descEl = $('lectureViewDesc');
        const body = $('lectureViewBody');
        if (titleEl) titleEl.textContent = playback.title || meta?.title || 'Bài giảng';
        if (descEl) {
            descEl.textContent = meta?.description || '';
            descEl.hidden = !meta?.description;
        }
        if (!body) return;
        body.replaceChildren();
        if (playback.type === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.src = playback.url;
            video.className = 'lecture-video';
            body.appendChild(video);
            return;
        }
        const fileName = playback.original_name || 'tai-lieu.pdf';
        const panel = document.createElement('div');
        panel.className = 'lecture-file-panel';
        panel.innerHTML =
            `<div class="lecture-file-icon" aria-hidden="true">${ICON_DOC}</div>` +
            `<p class="lecture-file-name">${escapeAttr(fileName)}</p>` +
            `<p class="lecture-file-note">Tài liệu mật · chỉ xem khi đã đăng nhập</p>` +
            `<div class="lecture-file-actions"></div>`;
        const actions = panel.querySelector('.lecture-file-actions');
        const dl = document.createElement('a');
        dl.className = 'lecture-btn lecture-btn-primary';
        dl.href = playback.url;
        dl.download = fileName;
        dl.rel = 'noopener';
        dl.textContent = 'Tải về';
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'lecture-btn lecture-btn-ghost';
        openBtn.textContent = 'Mở xem';
        openBtn.addEventListener('click', () => window.open(playback.url, '_blank', 'noopener'));
        actions.appendChild(dl);
        actions.appendChild(openBtn);
        body.appendChild(panel);
    }

    async function openView(id) {
        showLoading('Đang mở bài giảng...');
        try {
            const [lectures, playback] = await Promise.all([
                lectureApi.listLectures(),
                lectureApi.getLectureUrl(id)
            ]);
            const meta = lectures.find(l => l.id === id) || { title: playback.title };
            renderView(meta, playback);
            showScreen('screenLectureView');
        } catch (err) {
            handleError(err, { context: 'UserLectures.view', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    $('btnModeLectures')?.addEventListener('click', () => openList());
    $('btnBackHomeFromLectures')?.addEventListener('click', () => showScreen('screenHome'));
    $('btnBackLecturesFromView')?.addEventListener('click', () => {
        const video = document.querySelector('#lectureViewBody video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
        openList();
    });
}
