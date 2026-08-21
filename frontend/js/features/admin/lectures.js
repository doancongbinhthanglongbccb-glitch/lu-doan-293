import { $ } from '../../utils/dom.js';
import { escapeAttr } from '../../utils/html.js';
import { formatExamDate } from '../../utils/date.js';
import { ModalManager } from '../../ui/modal-manager.js';
import { Toast } from '../../ui/toast.js';
import { showLoading, hideLoading } from '../../ui/loading.js';
import { handleError } from '../../utils/errors.js';
import * as lectureApi from '../../services/lecture.service.js';

const STATUS_LABELS = {
    pending: 'Đang xử lý',
    ready: 'Sẵn sàng',
    failed: 'Lỗi'
};

const STATUS_CLASS = {
    pending: 'status-pending',
    ready: 'status-approved',
    failed: 'status-rejected'
};

const TYPE_LABELS = {
    video: 'Video',
    document: 'Tài liệu'
};

const MIME_ACCEPT = {
    video: 'video/mp4,video/webm,.mp4,.webm',
    document: 'application/pdf,.pdf'
};

/**
 * @param {{ getBattalions: () => object[] }} deps
 */
export function initAdminLectures({ getBattalions }) {
    const panel = {
        filters: { type: '', battalion_id: '', status: '' },
        editingId: null,
        selectedFile: null,
        bound: false
    };

    function battalionNameList(lecture) {
        const list = lecture.battalions || [];
        if (!list.length) return 'Tất cả';
        return list.map(b => b.name).join(', ');
    }

    function selectedBattalionIds() {
        return Array.from(document.querySelectorAll('.lecture-battalion-chk:checked')).map(el =>
            parseInt(el.value, 10)
        );
    }

    function fillBattalionFilter() {
        const sel = $('lectureFilterBattalion');
        if (!sel) return;
        const current = sel.value;
        sel.replaceChildren();
        const all = document.createElement('option');
        all.value = '';
        all.textContent = 'Tất cả tiểu đoàn';
        sel.appendChild(all);
        (getBattalions() || [])
            .filter(b => b.isActive)
            .forEach(b => {
                const opt = document.createElement('option');
                opt.value = String(b.id);
                opt.textContent = b.name;
                sel.appendChild(opt);
            });
        if ([...sel.options].some(o => o.value === current)) sel.value = current;
    }

    function fillBattalionChecks(selectedIds = []) {
        const list = $('lectureBattalionList');
        if (!list) return;
        list.replaceChildren();
        const active = (getBattalions() || []).filter(b => b.isActive);
        list.classList.toggle('admin-choice-list--scroll', active.length > 6);
        if (!active.length) {
            const empty = document.createElement('p');
            empty.className = 'admin-choice-empty';
            empty.textContent = 'Chưa có tiểu đoàn. Không chọn = hiện cho tất cả.';
            list.appendChild(empty);
            return;
        }
        active.forEach(b => {
            const row = document.createElement('label');
            row.className = 'admin-choice-item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'lecture-battalion-chk';
            input.value = String(b.id);
            input.checked = selectedIds.includes(b.id);
            const text = document.createElement('span');
            text.className = 'admin-choice-text';
            text.textContent = b.name;
            row.appendChild(input);
            row.appendChild(text);
            list.appendChild(row);
        });
    }

    function setType(type) {
        const radio = document.querySelector(`input[name="lectureType"][value="${type}"]`);
        if (radio) radio.checked = true;
        const file = $('lectureFile');
        if (file) {
            file.accept = MIME_ACCEPT[type] || MIME_ACCEPT.video;
            file.value = '';
        }
        panel.selectedFile = null;
        const nameEl = $('lectureFileName');
        if (nameEl && !$('lectureUploadZone')?.hidden) nameEl.textContent = 'Chưa chọn tệp';
    }

    function currentType() {
        return document.querySelector('input[name="lectureType"]:checked')?.value || 'video';
    }

    function resolveContentType(file, lectureType) {
        const t = String(file.type || '').toLowerCase();
        if (t) return t;
        const name = String(file.name || '').toLowerCase();
        if (name.endsWith('.mp4')) return 'video/mp4';
        if (name.endsWith('.webm')) return 'video/webm';
        if (name.endsWith('.pdf')) return 'application/pdf';
        return lectureType === 'document' ? 'application/pdf' : 'video/mp4';
    }

    function setProgress(ratio, visible) {
        const wrap = $('lectureUploadProgressWrap');
        const bar = $('lectureUploadProgress');
        if (wrap) wrap.hidden = !visible;
        if (bar) bar.value = Math.round((ratio || 0) * 100);
    }

    function putFile(url, file, contentType, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) onProgress(e.loaded / e.total);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error('Tải tệp lên kho lưu trữ thất bại.'));
            };
            xhr.onerror = () => reject(new Error('Tải tệp lên kho lưu trữ thất bại.'));
            xhr.send(file);
        });
    }

    function renderStats(lectures) {
        const total = lectures.length;
        const videos = lectures.filter(l => l.type === 'video').length;
        const docs = lectures.filter(l => l.type === 'document').length;
        const elTotal = $('statLectureTotal');
        const elVideo = $('statLectureVideo');
        const elDoc = $('statLectureDocument');
        if (elTotal) elTotal.textContent = String(total);
        if (elVideo) elVideo.textContent = String(videos);
        if (elDoc) elDoc.textContent = String(docs);
    }

    function renderTable(lectures) {
        const tbody = $('lectureTableBody');
        if (!tbody) return;
        tbody.replaceChildren();
        if (!lectures.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.className = 'empty-cell';
            td.textContent = 'Chưa có bài giảng.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        lectures.forEach((row, idx) => {
            const tr = document.createElement('tr');
            const status = row.status || 'pending';
            tr.innerHTML =
                `<td>${idx + 1}</td>` +
                `<td>${escapeAttr(row.title)}</td>` +
                `<td><span class="badge">${escapeAttr(TYPE_LABELS[row.type] || row.type)}</span></td>` +
                `<td><span class="status-badge ${STATUS_CLASS[status] || ''}">${escapeAttr(STATUS_LABELS[status] || status)}</span></td>` +
                `<td>${escapeAttr(battalionNameList(row))}</td>` +
                `<td>${escapeAttr(formatExamDate(row.created_at))}</td>` +
                `<td class="actions-cell">` +
                `<button type="button" class="btn-sm btn-edit" data-lecture-edit="${row.id}">Sửa</button>` +
                `<button type="button" class="btn-sm btn-delete" data-lecture-delete="${row.id}">Xóa</button>` +
                `</td>`;
            tbody.appendChild(tr);
        });
    }

    async function refresh() {
        fillBattalionFilter();
        showLoading('Đang tải bài giảng...');
        try {
            const lectures = await lectureApi.listLectures({
                type: panel.filters.type || undefined,
                status: panel.filters.status || undefined,
                battalion_id: panel.filters.battalion_id || undefined
            });
            renderStats(lectures);
            renderTable(lectures);
        } catch (err) {
            handleError(err, { context: 'AdminLectures.refresh', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    function openCreateModal() {
        panel.editingId = null;
        panel.selectedFile = null;
        $('lectureModalTitle').textContent = 'Thêm bài giảng';
        $('lectureTitle').value = '';
        $('lectureDescription').value = '';
        setType('video');
        fillBattalionChecks([]);
        $('lectureFileName').textContent = 'Chưa chọn tệp';
        $('lectureUploadZone').hidden = false;
        $('lectureFile').value = '';
        document.querySelectorAll('input[name="lectureType"]').forEach(r => {
            r.disabled = false;
        });
        setProgress(0, false);
        ModalManager.open('lectureModal');
    }

    function openEditModal(lecture) {
        panel.editingId = lecture.id;
        panel.selectedFile = null;
        $('lectureModalTitle').textContent = 'Sửa bài giảng';
        $('lectureTitle').value = lecture.title || '';
        $('lectureDescription').value = lecture.description || '';
        setType(lecture.type === 'document' ? 'document' : 'video');
        fillBattalionChecks((lecture.battalions || []).map(b => b.id));
        $('lectureUploadZone').hidden = true;
        document.querySelectorAll('input[name="lectureType"]').forEach(r => {
            r.disabled = true;
        });
        setProgress(0, false);
        ModalManager.open('lectureModal');
    }

    async function saveModal() {
        const title = $('lectureTitle').value.trim();
        if (!title) {
            Toast.warning('Vui lòng nhập tiêu đề.');
            return;
        }
        const description = $('lectureDescription').value.trim();
        const battalion_ids = selectedBattalionIds();

        if (panel.editingId) {
            showLoading('Đang lưu...');
            try {
                await lectureApi.updateLecture(panel.editingId, { title, description, battalion_ids });
                ModalManager.close('lectureModal');
                Toast.success('Đã cập nhật bài giảng.');
                await refresh();
            } catch (err) {
                handleError(err, { context: 'AdminLectures.update', fallbackKey: 'NETWORK' });
            } finally {
                hideLoading();
            }
            return;
        }

        const file = panel.selectedFile || $('lectureFile')?.files?.[0];
        if (!file) {
            Toast.warning('Vui lòng chọn tệp video hoặc PDF.');
            return;
        }
        const type = currentType();
        const content_type = resolveContentType(file, type);

        showLoading('Đang tạo bài giảng...');
        try {
            const created = await lectureApi.createLecture({
                title,
                description: description || undefined,
                type,
                battalion_ids,
                content_type,
                original_name: file.name,
                size_bytes: file.size
            });
            setProgress(0, true);
            showLoading('Đang tải tệp...');
            await putFile(created.upload_url, file, content_type, ratio => setProgress(ratio, true));
            showLoading('Đang xác nhận...');
            await lectureApi.confirmLecture(created.id);
            setProgress(1, true);
            ModalManager.close('lectureModal');
            Toast.success('Bài giảng đã sẵn sàng.');
            await refresh();
        } catch (err) {
            handleError(err, { context: 'AdminLectures.create', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async function onTableClick(e) {
        const editBtn = e.target.closest('[data-lecture-edit]');
        const delBtn = e.target.closest('[data-lecture-delete]');
        if (editBtn) {
            const id = parseInt(editBtn.getAttribute('data-lecture-edit'), 10);
            const lectures = await lectureApi.listLectures();
            const row = lectures.find(l => l.id === id);
            if (row) openEditModal(row);
            return;
        }
        if (delBtn) {
            const id = parseInt(delBtn.getAttribute('data-lecture-delete'), 10);
            if (!window.confirm('Xóa bài giảng này? Tệp trên kho lưu trữ cũng sẽ bị xóa.')) return;
            showLoading('Đang xóa...');
            try {
                await lectureApi.deleteLecture(id);
                Toast.success('Đã xóa bài giảng.');
                await refresh();
            } catch (err) {
                handleError(err, { context: 'AdminLectures.delete', fallbackKey: 'NETWORK' });
            } finally {
                hideLoading();
            }
        }
    }

    function bindDropzone() {
        const zone = $('lectureDropzone');
        const fileInput = $('lectureFile');
        if (!zone || !fileInput) return;

        const setFile = file => {
            panel.selectedFile = file || null;
            $('lectureFileName').textContent = file ? file.name : 'Chưa chọn tệp';
        };

        fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('is-dragover');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                setFile(file);
            }
        });
    }

    function bind() {
        if (panel.bound) return;
        panel.bound = true;

        $('btnAddLecture')?.addEventListener('click', openCreateModal);
        $('btnCancelLecture')?.addEventListener('click', () => ModalManager.close('lectureModal'));
        $('btnSaveLecture')?.addEventListener('click', () => saveModal());
        $('lectureTableBody')?.addEventListener('click', onTableClick);
        document.querySelectorAll('input[name="lectureType"]').forEach(radio => {
            radio.addEventListener('change', () => setType(radio.value));
        });

        const typeFilter = $('lectureFilterType');
        const battalionFilter = $('lectureFilterBattalion');
        const statusFilter = $('lectureFilterStatus');
        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                panel.filters.type = typeFilter.value;
                refresh();
            });
        }
        if (battalionFilter) {
            battalionFilter.addEventListener('change', () => {
                panel.filters.battalion_id = battalionFilter.value;
                refresh();
            });
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                panel.filters.status = statusFilter.value;
                refresh();
            });
        }
        bindDropzone();
    }

    bind();
    return { refresh };
}
