import { APP_CONFIG, ROUTES, QUESTION_TYPES } from '../../config/index.js';
import { $ } from '../../utils/dom.js';
import { htmlToText, escapeAttr } from '../../utils/html.js';
import { clone } from '../../utils/array.js';
import { assignQuestionHash } from '../../utils/hash.js';
import {
    countAllQuestions,
    nextQuestionId
} from '../../core/grading.js';
import * as quizRepo from '../../storage/quiz-repository.js';
import {
    importWorkbook,
    exportWorkbook,
    repairEssayQuestions,
    renderTemplateMenu,
    textToHtml,
    htmlToEditText
} from '../../services/excel/index.js';
import { auth } from '../../services/auth/index.js';
import { ModalManager } from '../../ui/modal-manager.js';
import { Toast } from '../../ui/toast.js';
import { showLoading, hideLoading } from '../../ui/loading.js';
import { handleError } from '../../utils/errors.js';
import { renderAdminHistoryTable } from '../quiz/exam-history-renderer.js';
import { apiClient } from '../../services/api/api-client.js';
import { unwrapPayload, pickBattalions, pickStats, pickSettings } from '../../services/api/api-response.js';
import * as checkExamApi from '../../services/exam/check-exam-api.js';
import * as practiceMixedApi from '../../services/quiz/practice-mixed-api.js';
import {
    isTopicParent,
    isTopicLeaf,
    resolveTopicRef,
    getTopicDisplayTitle,
    topicQuestionCount,
    countLeafTopics,
    countParentTopics,
    findTopicTitleConflict,
    quizPayloadWouldCycle
} from '../../core/topic-tree.js';

/**
 * Admin panel controller — CRUD topics/questions, Excel, user management.
 */
export class AdminController {
    constructor() {
        /** @type {object|null} */
        this.quizData = null;
        /** @type {{ p: number, c: number|null }} */
        this.selectedTopicRef = { p: 0, c: null };
        this.editingQuestionIdx = -1;
        this.userTab = 'pending';
        this.userSearchQuery = '';
        this.historySearchQuery = '';
        this.historyTypeFilter = 'check';
        this.historyBattalionFilter = '';
        /** @type {object[]} */
        this.historyRecords = [];
        this._historySearchTimer = null;
        /** @type {object[]} */
        this.battalions = [];
        /** @type {object[]} */
        this.examSessions = [];
        this.userBattalionFilter = '';
        this.progressMatrixSessionId = '';
    }

    /** Initialize admin panel */
    async init() {
        const currentUser = await auth.requireAdminAsync();
        if (!currentUser) return;

        $('adminUserName').textContent = currentUser.fullName || 'Admin';
        this.bindEvents();
        this.bindUserEvents();
        this.bindBattalionEvents();
        this.bindExamEvents();
        this.bindHistoryEvents();

        showLoading('Đang tải...');

        try {
            await this.loadBattalions();
            await auth.initUsers(this.userBattalionFilter || undefined);
            await this._loadData();

            this.renderStats();
            this._selectFirstLeaf();
            this.renderTopicList();
            this.renderQuestionList();
            this.renderUserTable();
        } catch (err) {
            handleError(err, { context: 'AdminController.init', fallbackKey: 'QUIZ_LOAD' });
        } finally {
            hideLoading();
        }
    }

    async _loadData() {
        this.quizData = await quizRepo.loadQuizData();
        if (repairEssayQuestions(this.quizData)) {
            try {
                this.quizData = await quizRepo.saveQuizData(this.quizData);
            } catch (err) {
                if (this._handleStaleQuizConflict(err)) return;
                throw err;
            }
        }
    }

    _isSameTopicRef(a, b) {
        return a.p === b.p && a.c === b.c;
    }

    _getSelectedTopic() {
        return resolveTopicRef(this.quizData, this.selectedTopicRef);
    }

    _selectFirstLeaf() {
        const topics = this.quizData?.topics || [];
        for (let p = 0; p < topics.length; p++) {
            const topic = topics[p];
            if (isTopicParent(topic)) {
                this.selectedTopicRef =
                    topic.children?.length > 0 ? { p, c: 0 } : { p, c: null };
                return;
            }
            this.selectedTopicRef = { p, c: null };
            return;
        }
        this.selectedTopicRef = { p: 0, c: null };
    }

    renderStats() {
        if (!this.quizData) return;
        const parents = countParentTopics(this.quizData);
        const leaves = countLeafTopics(this.quizData);
        const statTopics = $('statTopics');
        const statQuestions = $('statQuestions');
        const statTitle = $('statTitle');
        if (statTopics) {
            statTopics.textContent =
                parents > 0 ? `${parents} nhóm / ${leaves} môn` : String(leaves);
        }
        if (statQuestions) statQuestions.textContent = countAllQuestions(this.quizData);
        if (statTitle) statTitle.textContent = this.quizData.title || '—';
    }

    _bindAddChildBtn(rowEl, p) {
        const btn = rowEl.querySelector('.btn-topic-add-child');
        if (!btn) return;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            this.openTopicModal('add-child', { p, c: null });
        });
    }

    _bindClick(id, handler) {
        const el = $(id);
        if (el) el.onclick = handler;
    }

    renderTopicList() {
        const list = $('topicList');
        if (!list) return;
        list.innerHTML = '';

        (this.quizData?.topics || []).forEach((topic, p) => {
            if (isTopicParent(topic)) {
                const group = document.createElement('li');
                group.className = 'admin-topic-group';

                const parentRow = document.createElement('div');
                parentRow.className =
                    'admin-topic-parent' +
                    (this._isSameTopicRef(this.selectedTopicRef, { p, c: null }) ? ' active' : '');
                parentRow.innerHTML = this._topicRowHtml({
                    title: topic.title,
                    count: topicQuestionCount(topic),
                    showAddChild: true
                });
                parentRow.onclick = () => {
                    this.selectedTopicRef = { p, c: null };
                    this.renderTopicList();
                    this.renderQuestionList();
                };
                this._bindAddChildBtn(parentRow, p);
                group.appendChild(parentRow);

                const childList = document.createElement('ul');
                childList.className = 'admin-topic-list';
                topic.children.forEach((child, c) => {
                    const li = document.createElement('li');
                    li.className =
                        'admin-topic-item child' +
                        (this._isSameTopicRef(this.selectedTopicRef, { p, c }) ? ' active' : '');
                    li.innerHTML = this._topicRowHtml({
                        title: child.title,
                        count: (child.questions || []).length,
                        showAddChild: false
                    });
                    li.onclick = () => {
                        this.selectedTopicRef = { p, c };
                        this.renderTopicList();
                        this.renderQuestionList();
                    };
                    childList.appendChild(li);
                });
                group.appendChild(childList);
                list.appendChild(group);
            } else {
                const li = document.createElement('li');
                li.className =
                    'admin-topic-item parent-only' +
                    (this._isSameTopicRef(this.selectedTopicRef, { p, c: null }) ? ' active' : '');
                li.innerHTML = this._topicRowHtml({
                    title: topic.title,
                    count: (topic.questions || []).length,
                    showAddChild: true
                });
                li.onclick = () => {
                    this.selectedTopicRef = { p, c: null };
                    this.renderTopicList();
                    this.renderQuestionList();
                };
                this._bindAddChildBtn(li, p);
                list.appendChild(li);
            }
        });
    }

    /**
     * @param {Object} opts
     * @param {string} opts.title
     * @param {number} opts.count
     * @param {boolean} opts.showAddChild
     * @returns {string}
     */
    _topicRowHtml({ title, count, showAddChild }) {
        return (
            `<span class="topic-name" title="${escapeAttr(title)}">${escapeAttr(title)}</span>` +
            (showAddChild
                ? '<button type="button" class="btn-topic-add-child" title="Thêm môn con">+</button>'
                : '') +
            `<span class="topic-count" title="Số câu hỏi">${count}</span>`
        );
    }

    renderQuestionList() {
        const topic = this._getSelectedTopic();
        const parent = this.quizData?.topics?.[this.selectedTopicRef.p];
        const isParentGroup = parent && isTopicParent(parent) && this.selectedTopicRef.c == null;

        $('currentTopicTitle').textContent = isParentGroup
            ? `${parent.title} (chọn môn con)`
            : getTopicDisplayTitle(this.quizData, this.selectedTopicRef);

        if (isParentGroup) {
            $('questionCountBadge').textContent = '0 câu';
            $('questionTableBody').innerHTML =
                '<tr><td colspan="4" class="empty-cell">Nhóm này đã có môn con — chọn một môn con bên trái để quản lý câu hỏi.</td></tr>';
            return;
        }

        if (!topic) {
            $('questionCountBadge').textContent = '0 câu';
            $('questionTableBody').innerHTML =
                '<tr><td colspan="4" class="empty-cell">Chưa có dữ liệu chủ đề.</td></tr>';
            return;
        }

        const questions = topic.questions || [];
        $('questionCountBadge').textContent = questions.length + ' câu';

        const tbody = $('questionTableBody');
        tbody.innerHTML = '';

        questions.forEach((q, idx) => {
            const tr = document.createElement('tr');
            const preview = htmlToText(q.contentHtml).substring(0, 80);
            const correctLetters = q.answers.filter(a => a.isCorrect).map(a => a.letter).join(', ');
            tr.innerHTML =
                `<td>${idx + 1}</td>` +
                `<td class="q-preview">${escapeAttr(preview)}${preview.length >= 80 ? '...' : ''}</td>` +
                `<td>${correctLetters}</td>` +
                '<td class="actions-cell">' +
                `<button class="btn-sm btn-edit" data-idx="${idx}">Sửa</button>` +
                `<button class="btn-sm btn-delete" data-idx="${idx}">Xóa</button></td>`;
            tr.querySelector('.btn-edit').onclick = () => this.openQuestionModal(idx);
            tr.querySelector('.btn-delete').onclick = () => this.deleteQuestion(idx);
            tbody.appendChild(tr);
        });
    }

    async saveData() {
        if (quizPayloadWouldCycle(this.quizData?.topics)) {
            Toast.error('Cây chủ đề không hợp lệ: trùng id hoặc cha-con tạo vòng lặp.');
            return;
        }
        const snapshot = clone(this.quizData);
        try {
            this.quizData = await quizRepo.saveQuizData(this.quizData);
            this.renderStats();
            this.renderTopicList();
            this.renderQuestionList();
        } catch (err) {
            this.quizData = snapshot;
            if (this._handleStaleQuizConflict(err)) return;
            Toast.error(err.message || 'Không lưu được dữ liệu.');
            throw err;
        }
    }

    /**
     * PUT /quiz 409: tab đang cầm dữ liệu cũ — hỏi reload, không ghi đè.
     * @param {Error} err
     * @returns {boolean}
     */
    _handleStaleQuizConflict(err) {
        if (err?.status !== 409) return false;
        ModalManager.confirm({
            title: 'Dữ liệu đã cũ',
            message:
                'Dữ liệu đã bị thay đổi bởi người khác/tab khác. Bạn muốn tải lại mới nhất không?',
            confirmText: 'Tải lại',
            onConfirm: () => window.location.reload()
        });
        return true;
    }

    openTopicModal(mode, ref = null) {
        if (!this.quizData?.topics) {
            return Toast.warning('Đang tải dữ liệu chủ đề, vui lòng thử lại sau.');
        }
        const modal = $('topicModal');
        modal.dataset.mode = mode;
        modal.dataset.ref = ref ? JSON.stringify(ref) : '';

        const parentGroup = $('topicParentGroup');
        const parentSelect = $('topicParentSelect');

        if (mode === 'add-child') {
            const parentTopic = ref?.p != null ? this.quizData.topics[ref.p] : null;
            if (parentTopic) {
                $('topicModalTitle').textContent = `Thêm môn con — ${parentTopic.title}`;
                parentGroup.hidden = true;
            } else {
                $('topicModalTitle').textContent = 'Thêm môn con';
                parentGroup.hidden = false;
                parentSelect.innerHTML = '';
                this.quizData.topics.forEach((t, p) => {
                    const opt = document.createElement('option');
                    opt.value = String(p);
                    opt.textContent = isTopicParent(t) ? t.title : `${t.title} (thêm môn con)`;
                    parentSelect.appendChild(opt);
                });
                if (isTopicParent(this.quizData.topics[this.selectedTopicRef.p])) {
                    parentSelect.value = String(this.selectedTopicRef.p);
                }
            }
            $('topicNameInput').value = '';
        } else if (mode === 'edit') {
            const r = ref || this.selectedTopicRef;
            const isChild = r.c != null;
            $('topicModalTitle').textContent = isChild ? 'Sửa môn con' : 'Sửa chủ đề';
            parentGroup.hidden = true;
            const topic = resolveTopicRef(this.quizData, r);
            $('topicNameInput').value = topic?.title || '';
        } else {
            $('topicModalTitle').textContent = 'Thêm nhóm lớn';
            parentGroup.hidden = true;
            $('topicNameInput').value = '';
        }

        ModalManager.open('topicModal');
    }

    async saveTopic() {
        const title = $('topicNameInput').value.trim();
        if (!title) return Toast.warning('Vui lòng nhập tên chủ đề.');

        const modal = $('topicModal');
        const mode = modal.dataset.mode;
        const ref = modal.dataset.ref ? JSON.parse(modal.dataset.ref) : null;

        if (mode === 'add-parent') {
            const conflict = findTopicTitleConflict(this.quizData, title, { scope: 'root' });
            if (conflict) {
                return Toast.error(
                    `Đã có chủ đề trùng tên: "${conflict.title}". Tên trùng không phân biệt hoa/thường và các loại gạch (-, —, –). Hãy đặt tên khác.`
                );
            }
            this.quizData.topics.push({ title, questions: [] });
            this.selectedTopicRef = { p: this.quizData.topics.length - 1, c: null };
        } else if (mode === 'add-child') {
            const p =
                ref?.p != null ? ref.p : parseInt($('topicParentSelect').value, 10);
            let parent = this.quizData.topics[p];
            if (!parent) return Toast.error('Không tìm thấy nhóm cha.');

            if (isTopicLeaf(parent)) {
                const existing = parent.questions || [];
                parent.children = [];
                if (existing.length) {
                    parent.children.push({
                        title: `${parent.title} (chung)`,
                        questions: existing
                    });
                }
                delete parent.questions;
            }
            if (!parent.children) parent.children = [];

            const conflict = findTopicTitleConflict(this.quizData, title, {
                scope: 'children',
                parentIndex: p
            });
            if (conflict) {
                return Toast.error(
                    `Trong nhóm "${parent.title}" đã có môn con trùng tên: "${conflict.title}". Tên trùng không phân biệt hoa/thường và các loại gạch (-, —, –). Hãy đặt tên khác.`
                );
            }

            parent.children.push({ title, questions: [] });
            this.selectedTopicRef = { p, c: parent.children.length - 1 };
        } else if (mode === 'edit' && ref) {
            const isChild = ref.c != null;
            const conflict = findTopicTitleConflict(this.quizData, title, {
                scope: isChild ? 'children' : 'root',
                parentIndex: isChild ? ref.p : null,
                excludeRef: ref
            });
            if (conflict) {
                return Toast.error(
                    `Tên bị trùng với "${conflict.title}". Tên trùng không phân biệt hoa/thường và các loại gạch (-, —, –). Hãy đặt tên khác.`
                );
            }
            const topic = resolveTopicRef(this.quizData, ref);
            if (topic) topic.title = title;
        }

        ModalManager.close('topicModal');
        await this.saveData();
    }

    deleteTopic() {
        const { p, c } = this.selectedTopicRef;
        const parent = this.quizData.topics[p];
        if (!parent) return;

        if (c != null) {
            const child = parent.children?.[c];
            if (!child) return;
            ModalManager.confirm({
                title: 'Xóa môn con',
                message: `Xóa môn "${child.title}" và ${child.questions.length} câu hỏi?`,
                onConfirm: async () => {
                    parent.children.splice(c, 1);
                    this.selectedTopicRef = {
                        p,
                        c: parent.children.length ? Math.min(c, parent.children.length - 1) : null
                    };
                    await this.saveData();
                }
            });
            return;
        }

        if (this.quizData.topics.length <= 1 && !isTopicParent(parent)) {
            return Toast.warning('Phải giữ ít nhất một chủ đề.');
        }

        const qCount = topicQuestionCount(parent);
        const label = isTopicParent(parent) ? `nhóm "${parent.title}" và toàn bộ môn con` : `chủ đề "${parent.title}"`;
        ModalManager.confirm({
            title: 'Xóa chủ đề',
            message: `Xóa ${label} (${qCount} câu hỏi)?`,
            onConfirm: async () => {
                this.quizData.topics.splice(p, 1);
                this._selectFirstLeaf();
                await this.saveData();
            }
        });
    }

    clearAllQuestionsInTopic() {
        const topic = this._getSelectedTopic();
        if (!topic) return Toast.warning('Chọn chủ đề trước.');
        if (!topic.questions.length) return Toast.warning('Chủ đề này chưa có câu hỏi.');
        ModalManager.confirm({
            title: 'Xóa câu hỏi',
            message: `Xóa hết ${topic.questions.length} câu hỏi trong chủ đề "${topic.title}"?\nChủ đề vẫn được giữ lại.`,
            onConfirm: async () => {
                topic.questions = [];
                await this.saveData();
            }
        });
    }

    isEssayMode() {
        return false;
    }

    readAnswersFromRows() {
        const answers = [];
        document.querySelectorAll('#answerRows .answer-row').forEach((row, i) => {
            const el = row.querySelector('.ans-html');
            if (!el) return;
            const text = el.value.trim();
            if (!text) return;
            const correctEl = row.querySelector('.ans-correct');
            answers.push({
                letter: APP_CONFIG.ANSWER_LABELS[i] || String.fromCharCode(65 + i),
                html: textToHtml(text),
                isCorrect: correctEl ? correctEl.checked : true
            });
        });
        return answers;
    }

    buildAnswerRows(answers) {
        const container = $('answerRows');
        container.innerHTML = '';
        const btnAdd = $('btnAddAnswer');

        if (this.isEssayMode()) {
            if (btnAdd) btnAdd.style.display = 'none';
            const cor =
                answers?.length ? answers.find(a => a.isCorrect) || answers[0] : { html: '', isCorrect: true };
            this.addEssayAnswerRow(cor);
            return;
        }

        if (btnAdd) btnAdd.style.display = '';
        const ans = answers?.length
            ? answers
            : [
                  { letter: 'A', html: '', isCorrect: false },
                  { letter: 'B', html: '', isCorrect: false },
                  { letter: 'C', html: '', isCorrect: false },
                  { letter: 'D', html: '', isCorrect: false }
              ];
        ans.forEach((a, i) => this.addAnswerRow(a, i));
    }

    addEssayAnswerRow(data) {
        const container = $('answerRows');
        const row = document.createElement('div');
        row.className = 'answer-row answer-row-essay';
        row.innerHTML =
            '<label class="answer-essay-label">Đáp án mẫu <span class="hint-inline">(Enter để xuống dòng như Excel)</span></label>' +
            '<textarea class="ans-html ans-textarea" rows="10" placeholder="Nhập đáp án mẫu, giữ nguyên xuống dòng"></textarea>';
        row.querySelector('.ans-html').value = htmlToEditText(data.html || '');
        container.appendChild(row);
    }

    addAnswerRow(data, idx) {
        const container = $('answerRows');
        const row = document.createElement('div');
        row.className = 'answer-row';
        row.innerHTML =
            `<label class="answer-correct"><input type="checkbox" class="ans-correct"${data.isCorrect ? ' checked' : ''}> ${APP_CONFIG.ANSWER_LABELS[idx] || String.fromCharCode(65 + idx)}</label>` +
            `<input type="text" class="ans-html" placeholder="Nội dung đáp án" value="${escapeAttr(htmlToText(data.html))}">` +
            '<button type="button" class="btn-sm btn-delete remove-ans">×</button>';
        row.querySelector('.remove-ans').onclick = () => row.remove();
        container.appendChild(row);
    }

    openQuestionModal(qIdx) {
        this.editingQuestionIdx = qIdx;
        const topic = this._getSelectedTopic();
        if (!topic) return Toast.warning('Chọn chủ đề trước.');
        const q = qIdx >= 0 ? topic.questions[qIdx] : null;

        $('questionModalTitle').textContent = qIdx >= 0 ? 'Sửa câu hỏi' : 'Thêm câu hỏi';
        $('qIdInput').value = q ? q.id || '' : nextQuestionId(this.quizData);
        $('qContentInput').value = q ? htmlToEditText(q.contentHtml) : '';
        $('qNoShuffle').checked = q ? !!q.noShuffle : false;
        this.updateAnswersLabel();
        this.buildAnswerRows(q ? q.answers : null);
        ModalManager.open('questionModal');
    }

    updateAnswersLabel() {
        const label = $('answersLabel');
        if (!label) return;
        label.textContent = 'Đáp án (tick ✓ = đáp án đúng)';
    }

    collectQuestionFromForm() {
        const content = $('qContentInput').value.trim();
        if (!content) {
            Toast.warning('Vui lòng nhập nội dung câu hỏi.');
            return null;
        }

        const answers = this.readAnswersFromRows();

        if (answers.length < 2) {
            Toast.warning('Cần ít nhất 2 đáp án.');
            return null;
        }
        if (!answers.some(a => a.isCorrect)) {
            Toast.warning('Chọn ít nhất một đáp án đúng.');
            return null;
        }

        const q = {
            id: parseInt($('qIdInput').value, 10) || nextQuestionId(this.quizData),
            contentHtml: textToHtml(content),
            type: QUESTION_TYPES.MULTIPLE_CHOICE,
            noShuffle: $('qNoShuffle').checked,
            answers,
            isMul: answers.filter(a => a.isCorrect).length > 1
        };
        assignQuestionHash(q);
        return q;
    }

    async saveQuestion() {
        const q = this.collectQuestionFromForm();
        if (!q) return;
        const topic = this._getSelectedTopic();
        if (!topic) return Toast.warning('Chọn chủ đề trước.');
        if (this.editingQuestionIdx >= 0) {
            topic.questions[this.editingQuestionIdx] = q;
        } else {
            topic.questions.push(q);
        }
        ModalManager.close('questionModal');
        await this.saveData();
    }

    deleteQuestion(idx) {
        ModalManager.confirm({
            title: 'Xóa câu hỏi',
            message: 'Xóa câu hỏi này?',
            onConfirm: async () => {
                const topic = this._getSelectedTopic();
                if (!topic) return;
                topic.questions.splice(idx, 1);
                await this.saveData();
            }
        });
    }

    /**
     * Import Excel vào topic đang chọn.
     * @param {File} file
     */
    importExcel(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const { questions, warnings } = importWorkbook(wb, file.name, this.quizData);

                if (!questions.length) {
                    return Toast.error(
                        'Không đọc được câu hỏi nào.\n\nKiểm tra định dạng:\n• Trắc nghiệm: Câu hỏi | Phương án | Đáp án đúng'
                    );
                }

                const mcQuestions = questions.filter(
                    q => q.type !== 'essayquestion' && q.type !== 'Fillintheblank'
                );
                if (!mcQuestions.length) {
                    return Toast.error(
                        'File chỉ có câu tự luận. Hệ thống hiện chỉ hỗ trợ trắc nghiệm.'
                    );
                }

                const skippedEssay = questions.length - mcQuestions.length;

                const currentTopic = this._getSelectedTopic();
                if (!currentTopic) {
                    const parent = this.quizData.topics[this.selectedTopicRef.p];
                    if (parent && isTopicParent(parent)) {
                        return Toast.error(
                            'Nhóm này đã có môn con — hãy chọn một môn con bên trái để import.'
                        );
                    }
                    return Toast.error('Chọn chủ đề để import.');
                }

                const preview = mcQuestions
                    .slice(0, 2)
                    .map((q, i) => `${i + 1}. ${htmlToText(q.contentHtml).substring(0, 60)}`)
                    .join('\n');

                const confirmMsg =
                    `Import ${mcQuestions.length} câu trắc nghiệm vào chủ đề "${currentTopic.title}"?\n\n` +
                    (skippedEssay
                        ? `• Đã bỏ qua ${skippedEssay} câu tự luận\n\n`
                        : '') +
                    `Xem trước:\n${preview}${mcQuestions.length > 2 ? '\n...' : ''}` +
                    (warnings.length
                        ? `\n\n⚠ ${warnings.length} cảnh báo (đáp án không khớp):\n${warnings.slice(0, 3).join('\n')}${warnings.length > 3 ? '\n...' : ''}`
                        : '');

                ModalManager.confirm({
                    title: 'Xác nhận Import',
                    message: confirmMsg,
                    onConfirm: async () => {
                        showLoading(`Đang import ${mcQuestions.length} câu hỏi...`);

                        try {
                            const topicId =
                                currentTopic.id || (await this._getSelectedTopicId());

                            if (!topicId) {
                                throw new Error('Không tìm thấy ID của chủ đề. Hãy tải lại trang.');
                            }

                            const { data } = await apiClient.post(
                                `/quiz/topics/${topicId}/import`,
                                { questions: mcQuestions },
                                { silent: true }
                            );
                            const result = unwrapPayload(data);

                            Toast.success(
                                `Import thành công ${result.added ?? mcQuestions.length} câu hỏi!`
                            );

                            await this._loadData();
                            this.renderStats();
                            this.renderTopicList();
                            this.renderQuestionList();
                        } catch (err) {
                            console.error(err);
                            Toast.error('Import thất bại: ' + err.message);
                        } finally {
                            hideLoading();
                        }
                    }
                });
            } catch (err) {
                console.error(err);
                Toast.error('Lỗi khi đọc file Excel: ' + err.message);
            }
        };

        reader.readAsArrayBuffer(file);
    }

    /**
     * Helper: Lấy topicId theo index (fallback)
     */
    async _getSelectedTopicId() {
        try {
            const freshData = await quizRepo.loadQuizData();
            const topic = resolveTopicRef(freshData, this.selectedTopicRef);
            return topic?.id ?? null;
        } catch {
            return null;
        }
    }

    bindEvents() {
        this._bindClick('btnAddTopic', () => this.openTopicModal('add-parent'));
        this._bindClick('btnEditTopic', () => this.openTopicModal('edit', this.selectedTopicRef));
        this._bindClick('btnDeleteTopic', () => this.deleteTopic());
        this._bindClick('btnClearAllQuestions', () => this.clearAllQuestionsInTopic());
        this._bindClick('btnSaveTopic', () => this.saveTopic());
        this._bindClick('btnCancelTopic', () => ModalManager.close('topicModal'));

        this._bindClick('btnAddQuestion', () => this.openQuestionModal(-1));
        this._bindClick('btnSaveQuestion', () => this.saveQuestion());
        this._bindClick('btnCancelQuestion', () => ModalManager.close('questionModal'));
        this._bindClick('btnAddAnswer', () =>
            this.addAnswerRow({ html: '', isCorrect: false }, $('answerRows').children.length)
        );

        this._bindClick('btnImportExcel', () => $('fileImportExcel')?.click());
        const fileImport = $('fileImportExcel');
        if (fileImport) {
            fileImport.onchange = e => {
                const file = e.target.files[0];
                if (file) this.importExcel(file);
                e.target.value = '';
            };
        }

        this._bindClick('btnExportExcel', () => {
            if (!this.quizData) return Toast.warning('Chưa tải được dữ liệu.');
            exportWorkbook(this.quizData);
        });
        this.setupTemplateMenu();

        this._bindClick('btnGoQuiz', () => {
            window.location.href = ROUTES.QUIZ;
        });
        this._bindClick('btnLogout', () => {
            ModalManager.confirm({
                title: 'Đăng xuất',
                message: 'Bạn có muốn đăng xuất?',
                onConfirm: async () => {
                    await auth.logout();
                    window.location.href = ROUTES.LOGIN;
                }
            });
        });
    }

    setupTemplateMenu() {
        const menu = $('templateMenu');
        const btn = $('btnExportTemplate');
        if (!menu || !btn) return;
        renderTemplateMenu(menu);
        btn.onclick = e => {
            e.stopPropagation();
            menu.classList.toggle('open');
        };
        document.addEventListener('click', () => menu.classList.remove('open'));
    }

    // ——— User management ———

    switchSection(section) {
        document.querySelectorAll('.admin-section-btn').forEach(btn => {
            const active = btn.dataset.section === section;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        $('panelQuestions').classList.toggle('active', section === 'questions');
        $('panelUsers').classList.toggle('active', section === 'users');
        $('panelSettings').classList.toggle('active', section === 'settings');
        $('panelExam').classList.toggle('active', section === 'exam');
        $('panelHistory').classList.toggle('active', section === 'history');
        if (section === 'users') this.renderUserTable();
        if (section === 'settings') {
            this.loadBattalionDashboard();
            this.renderQuizSettings();
            this.renderBattalionTable();
        }
        if (section === 'exam') this.loadExamSessions();
        if (section === 'history') this.loadHistoryTable();
    }

    getFilteredUsers() {
        const q = this.userSearchQuery.toLowerCase();
        return auth.getUsers().filter(u => {
            const inTab =
                this.userTab === 'pending'
                    ? u.status === 'pending'
                    : this.userTab === 'rejected'
                      ? u.status === 'rejected'
                      : u.status === 'approved';
            if (!inTab) return false;
            if (!q) return true;
            return u.militaryId.includes(q) || (u.fullName || '').toLowerCase().includes(q);
        });
    }

    updateUserTabCounts() {
        const users = auth.getUsers();
        const pending = users.filter(u => u.status === 'pending').length;
        const rejected = users.filter(u => u.status === 'rejected').length;
        const approved = users.filter(u => u.status === 'approved').length;

        const setText = (id, value) => {
            const el = $(id);
            if (el) el.textContent = String(value);
        };
        setText('pendingCount', pending);
        setText('rejectedCount', rejected);
        setText('approvedCount', approved);
        setText('statUserPending', pending);
        setText('statUserRejected', rejected);
        setText('statUserApproved', approved);
    }

    statusBadgeClass(status) {
        if (status === 'approved') return 'status-approved';
        if (status === 'rejected') return 'status-rejected';
        return 'status-pending';
    }

    renderUserTable() {
        this.updateUserTabCounts();
        const tbody = $('userTableBody');
        tbody.innerHTML = '';
        const users = this.getFilteredUsers();

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Không có user nào.</td></tr>';
            return;
        }

        users.forEach(u => {
            const tr = document.createElement('tr');
            const isAdmin = u.role === 'admin';
            let actions = '';

            if (u.status === 'pending' && !isAdmin) {
                actions += `<button class="btn-sm btn-green user-approve" data-id="${u.militaryId}">Duyệt</button> `;
                actions += `<button class="btn-sm btn-delete user-reject" data-id="${u.militaryId}">Từ chối</button> `;
            } else if (u.status === 'rejected' && !isAdmin) {
                actions += `<button class="btn-sm btn-green user-approve" data-id="${u.militaryId}">Duyệt lại</button> `;
            }
            actions += `<button class="btn-sm btn-edit user-edit" data-id="${u.militaryId}">Sửa</button> `;
            actions += `<button class="btn-sm btn-blue user-reset" data-id="${u.militaryId}">Reset MK</button> `;
            if (!isAdmin || auth.getUsers().filter(x => x.role === 'admin').length > 1) {
                actions += `<button class="btn-sm btn-delete user-delete" data-id="${u.militaryId}">Xóa</button>`;
            }

            tr.innerHTML =
                `<td><code class="user-id">${u.militaryId}</code></td>` +
                `<td>${escapeAttr(u.fullName || '—')}</td>` +
                `<td>${escapeAttr(u.battalionName || '—')}</td>` +
                `<td><span class="role-badge role-${u.role}">${u.role === 'admin' ? 'Admin' : 'User'}</span></td>` +
                `<td><span class="status-badge ${this.statusBadgeClass(u.status)}">${auth.getStatusLabel(u.status)}</span></td>` +
                `<td class="actions-cell user-actions">${actions}</td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.user-approve').forEach(btn => {
            btn.onclick = () => this.approveUser(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-reject').forEach(btn => {
            btn.onclick = () => this.rejectUser(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-edit').forEach(btn => {
            btn.onclick = () => this.openEditUserModal(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-reset').forEach(btn => {
            btn.onclick = () => this.openResetPwdModal(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-delete').forEach(btn => {
            btn.onclick = () => this.deleteUser(btn.dataset.id);
        });
    }

    async approveUser(militaryId) {
        const result = await auth.approveUser(militaryId);
        if (!result.ok) return Toast.error(result.message);
        this.renderUserTable();
        Toast.success('Đã duyệt tài khoản.');
    }

    async rejectUser(militaryId) {
        ModalManager.confirm({
            title: 'Từ chối',
            message: `Từ chối tài khoản ${militaryId}?`,
            onConfirm: async () => {
                const result = await auth.rejectUser(militaryId);
                if (!result.ok) return Toast.error(result.message);
                this.renderUserTable();
            }
        });
    }

    async deleteUser(militaryId) {
        const user = auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;
        ModalManager.confirm({
            title: 'Xóa user',
            message: `Xóa user "${user.fullName}" (${militaryId})?`,
            onConfirm: async () => {
                const result = await auth.deleteUser(militaryId);
                if (!result.ok) return Toast.error(result.message);
                this.renderUserTable();
            }
        });
    }

    openEditUserModal(militaryId) {
        const user = auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;

        $('editUserMilitaryId').value = user.militaryId;
        $('editUserIdDisplay').value = user.militaryId;
        $('editUserFullName').value = user.fullName || '';
        this.populateBattalionSelect($('editUserBattalion'), user.battalionId);
        $('editUserRole').value = user.role || 'user';
        $('editUserStatus').value = user.status || 'pending';

        const isAdmin = user.role === 'admin';
        $('editUserRole').disabled = isAdmin;
        $('editUserStatus').disabled = isAdmin;

        ModalManager.open('userEditModal');
    }

    async saveEditUser() {
        const militaryId = $('editUserMilitaryId').value;
        const result = await auth.updateUser(militaryId, {
            fullName: $('editUserFullName').value,
            battalionId: parseInt($('editUserBattalion').value, 10),
            role: $('editUserRole').value,
            status: $('editUserStatus').value
        });
        if (!result.ok) return Toast.error(result.message);
        ModalManager.close('userEditModal');
        this.renderUserTable();
    }

    openResetPwdModal(militaryId) {
        const user = auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;
        $('resetPwdMilitaryId').value = militaryId;
        $('resetPwdUserLabel').textContent = user.fullName + ' (' + militaryId + ')';
        $('resetPwdNew').value = '';
        ModalManager.open('userResetPwdModal');
    }

    async confirmResetPwd() {
        const militaryId = $('resetPwdMilitaryId').value;
        const result = await auth.resetPassword(militaryId, $('resetPwdNew').value);
        if (!result.ok) return Toast.error(result.message);
        ModalManager.close('userResetPwdModal');
        Toast.success('Đã reset mật khẩu thành công.');
    }

    bindUserEvents() {
        document.querySelectorAll('.admin-section-btn').forEach(btn => {
            btn.onclick = () => this.switchSection(btn.dataset.section);
        });

        document.querySelectorAll('.user-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.userTab = tab.dataset.usertab;
                this.renderUserTable();
            };
        });

        $('userSearchInput').oninput = e => {
            this.userSearchQuery = e.target.value.trim();
            this.renderUserTable();
        };

        const battalionFilter = $('userBattalionFilter');
        if (battalionFilter) {
            battalionFilter.onchange = async e => {
                this.userBattalionFilter = e.target.value;
                showLoading('Đang tải...');
                try {
                    await auth.reloadUsers(this.userBattalionFilter || undefined);
                    this.renderUserTable();
                } catch (err) {
                    handleError(err, { context: 'AdminController.battalionFilter', fallbackKey: 'NETWORK' });
                } finally {
                    hideLoading();
                }
            };
        }

        $('btnCancelEditUser').onclick = () => ModalManager.close('userEditModal');
        $('btnSaveEditUser').onclick = () => this.saveEditUser();
        $('btnCancelResetPwd').onclick = () => ModalManager.close('userResetPwdModal');
        $('btnConfirmResetPwd').onclick = () => this.confirmResetPwd();
    }

    // ——— Battalion management ———

    async loadBattalions() {
        const { data } = await apiClient.get('/battalions', { silent: true });
        this.battalions = pickBattalions(data) || [];
        this.populateBattalionFilter();
        this.populateHistoryFilters();
        return this.battalions;
    }

    populateBattalionFilter() {
        const select = $('userBattalionFilter');
        if (!select) return;
        const current = this.userBattalionFilter;
        select.innerHTML = '<option value="">Tất cả tiểu đoàn</option>';
        this.battalions.forEach(b => {
            const opt = document.createElement('option');
            opt.value = String(b.id);
            opt.textContent = b.isActive ? b.name : `${b.name} (ẩn)`;
            select.appendChild(opt);
        });
        select.value = current;
    }

    populateHistoryFilters() {
        const select = $('historyBattalionFilter');
        if (!select) return;
        const current = this.historyBattalionFilter;
        select.innerHTML = '<option value="">Tất cả tiểu đoàn</option>';
        this.battalions.forEach(b => {
            const opt = document.createElement('option');
            opt.value = String(b.id);
            opt.textContent = b.isActive ? b.name : `${b.name} (ẩn)`;
            select.appendChild(opt);
        });
        select.value = current;
    }

    populateBattalionSelect(selectEl, selectedId) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        this.battalions.forEach(b => {
            const opt = document.createElement('option');
            opt.value = String(b.id);
            opt.textContent = b.isActive ? b.name : `${b.name} (ẩn)`;
            if (selectedId && String(b.id) === String(selectedId)) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    async loadBattalionDashboard() {
        try {
            const { data } = await apiClient.get('/battalions/dashboard/registration', { silent: true });
            const stats = pickStats(data) || [];
            const container = $('battalionDashboardStats');
            if (!container) return;
            container.innerHTML = '<p class="admin-hint">Tổng số người dùng đã đăng ký theo tiểu đoàn. Đã thi / điểm chỉ tính bài Kiểm tra.</p>';
            stats.forEach(row => {
                const card = document.createElement('div');
                card.className = 'stat-card';
                const avg = row.avgScore != null ? row.avgScore : '—';
                const max = row.maxScore != null ? row.maxScore : '—';
                const min = row.minScore != null ? row.minScore : '—';
                card.innerHTML =
                    `<span class="stat-label">${escapeAttr(row.name)}</span>` +
                    `<span class="stat-value">${row.userCount ?? 0}</span>` +
                    `<span class="stat-extra">Đã thi: ${row.taken ?? 0}` +
                    `<br>Điểm TB: ${avg} · Cao: ${max} · Thấp: ${min}</span>`;
                container.appendChild(card);
            });
        } catch (err) {
            handleError(err, { context: 'AdminController.loadBattalionDashboard', fallbackKey: 'NETWORK' });
        }
    }

    renderBattalionTable() {
        const tbody = $('battalionTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!this.battalions.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Chưa có tiểu đoàn.</td></tr>';
            return;
        }

        this.battalions.forEach(b => {
            const tr = document.createElement('tr');
            const canDelete = (b.userCount ?? 0) === 0;
            const deleteBtn = canDelete
                ? `<button class="btn-sm btn-delete battalion-delete" data-id="${b.id}">Xóa</button>`
                : `<button class="btn-sm btn-delete" disabled title="Còn ${b.userCount} user — chuyển họ sang tiểu đoàn khác trước khi xóa">Xóa</button>`;

            tr.innerHTML =
                `<td>${escapeAttr(b.name)}</td>` +
                `<td>${b.userCount ?? 0}</td>` +
                `<td><span class="status-badge ${b.isActive ? 'status-approved' : 'status-rejected'}">${b.isActive ? 'Hiện' : 'Ẩn'}</span></td>` +
                `<td class="actions-cell">` +
                `<button class="btn-sm btn-edit battalion-edit" data-id="${b.id}">Sửa</button> ` +
                `<button class="btn-sm btn-blue battalion-toggle" data-id="${b.id}" data-active="${b.isActive ? '1' : '0'}">${b.isActive ? 'Ẩn' : 'Hiện'}</button> ` +
                deleteBtn +
                `</td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.battalion-edit').forEach(btn => {
            btn.onclick = () => this.openBattalionModal(parseInt(btn.dataset.id, 10));
        });
        tbody.querySelectorAll('.battalion-toggle').forEach(btn => {
            btn.onclick = () =>
                this.toggleBattalionActive(parseInt(btn.dataset.id, 10), btn.dataset.active !== '1');
        });
        tbody.querySelectorAll('.battalion-delete').forEach(btn => {
            btn.onclick = () => this.deleteBattalion(parseInt(btn.dataset.id, 10));
        });
    }

    openBattalionModal(id = null) {
        const isEdit = id != null;
        $('battalionModalTitle').textContent = isEdit ? 'Sửa tiểu đoàn' : 'Thêm tiểu đoàn';
        $('battalionEditId').value = isEdit ? String(id) : '';
        const battalion = isEdit ? this.battalions.find(b => b.id === id) : null;
        $('battalionNameInput').value = battalion?.name || '';
        ModalManager.open('battalionModal');
    }

    async saveBattalion() {
        const name = $('battalionNameInput').value.trim();
        if (!name) return Toast.warning('Vui lòng nhập tên tiểu đoàn.');

        const editId = $('battalionEditId').value;
        showLoading('Đang lưu...');
        try {
            if (editId) {
                await apiClient.patch(`/battalions/${editId}`, { name });
                Toast.success('Đã cập nhật tiểu đoàn.');
            } else {
                await apiClient.post('/battalions', { name });
                Toast.success('Đã thêm tiểu đoàn.');
            }
            ModalManager.close('battalionModal');
            await this.loadBattalions();
            await auth.reloadUsers(this.userBattalionFilter || undefined);
            this.renderBattalionTable();
            this.loadBattalionDashboard();
            this.renderUserTable();
        } catch (err) {
            Toast.error(err.message || 'Lưu tiểu đoàn thất bại.');
        } finally {
            hideLoading();
        }
    }

    async toggleBattalionActive(id, isActive) {
        showLoading('Đang cập nhật...');
        try {
            await apiClient.patch(`/battalions/${id}`, { isActive });
            Toast.success(isActive ? 'Đã hiện tiểu đoàn.' : 'Đã ẩn tiểu đoàn.');
            await this.loadBattalions();
            this.renderBattalionTable();
            this.loadBattalionDashboard();
        } catch (err) {
            Toast.error(err.message || 'Cập nhật thất bại.');
        } finally {
            hideLoading();
        }
    }

    deleteBattalion(id) {
        const battalion = this.battalions.find(b => b.id === id);
        if (!battalion) return;
        ModalManager.confirm({
            title: 'Xóa tiểu đoàn',
            message: `Xóa tiểu đoàn "${battalion.name}"? Hành động này không thể hoàn tác.`,
            onConfirm: async () => {
                showLoading('Đang xóa...');
                try {
                    await apiClient.delete(`/battalions/${id}`);
                    Toast.success('Đã xóa tiểu đoàn.');
                    await this.loadBattalions();
                    this.renderBattalionTable();
                    this.loadBattalionDashboard();
                } catch (err) {
                    Toast.error(err.message || 'Xóa tiểu đoàn thất bại.');
                } finally {
                    hideLoading();
                }
            }
        });
    }

    bindBattalionEvents() {
        $('btnAddBattalion').onclick = () => this.openBattalionModal();
        $('btnCancelBattalion').onclick = () => ModalManager.close('battalionModal');
        $('btnSaveBattalion').onclick = () => this.saveBattalion();
        $('btnSaveQuizSettings').onclick = () => this.saveQuizSettings();
        const regenBtn = $('btnRegenPracticeMixed');
        if (regenBtn) regenBtn.onclick = () => this.regeneratePracticeMixedSets();
    }

    renderQuizSettings() {
        const input = $('practiceMixedQuestionCount');
        if (!input || !this.quizData) return;
        const count = this.quizData.settings?.practiceMixedQuestionCount;
        input.value = count > 0 ? String(count) : '';
        const setCountInput = $('practiceMixedSetCount');
        if (setCountInput) {
            const setCount = this.quizData.settings?.practiceMixedSetCount;
            setCountInput.value = setCount > 0 ? String(setCount) : '5';
        }
        const bufferInput = $('examTimeBufferMinutes');
        if (bufferInput) {
            const buffer = this.quizData.settings?.examTimeBufferMinutes;
            bufferInput.value = buffer > 0 ? String(buffer) : '';
        }
    }

    async saveQuizSettings() {
        const input = $('practiceMixedQuestionCount');
        const setCountInput = $('practiceMixedSetCount');
        const bufferInput = $('examTimeBufferMinutes');
        if (!input) return;
        const count = parseInt(input.value, 10);
        const setCount = setCountInput ? parseInt(setCountInput.value, 10) : undefined;
        const buffer = bufferInput ? parseInt(bufferInput.value, 10) : undefined;
        if (!count || count < 1) {
            return Toast.warning('Số câu phải là số nguyên dương.');
        }
        if (setCountInput && (!setCount || setCount < 1)) {
            return Toast.warning('Số bộ phải là số nguyên dương.');
        }
        if (bufferInput && (!buffer || buffer < 1)) {
            return Toast.warning('Buffer thời gian phải là số nguyên dương.');
        }

        showLoading('Đang lưu...');
        try {
            const payload = { practiceMixedQuestionCount: count };
            if (setCount) payload.practiceMixedSetCount = setCount;
            if (buffer) payload.examTimeBufferMinutes = buffer;
            const { data } = await apiClient.patch('/quiz/settings', payload);
            const settings = pickSettings(data) || { practiceMixedQuestionCount: count };
            if (this.quizData) {
                this.quizData.settings = settings;
            }
            Toast.success('Đã cập nhật cài đặt ôn tập tổng hợp.');
        } catch (err) {
            Toast.error(err.message || 'Lưu cài đặt thất bại.');
        } finally {
            hideLoading();
        }
    }

    async regeneratePracticeMixedSets() {
        showLoading('Đang tái tạo bộ...');
        try {
            const setCount = await practiceMixedApi.regenerateSets();
            Toast.success(`Đã tái tạo ${setCount} bộ ôn tập tổng hợp.`);
        } catch (err) {
            Toast.error(err.message || 'Tái tạo bộ thất bại.');
        } finally {
            hideLoading();
        }
    }

    async loadExamSessions() {
        try {
            this.examSessions = await checkExamApi.loadSessionsAdmin();
            this.renderExamSessionTable();
            this.populateProgressMatrixSelect();
            await this.loadProgressMatrix();
        } catch (err) {
            handleError(err, { context: 'AdminController.loadExamSessions', fallbackKey: 'NETWORK' });
        }
    }

    populateProgressMatrixSelect() {
        const select = $('progressMatrixSession');
        if (!select) return;
        const sessions = this.examSessions || [];
        const current = this.progressMatrixSessionId || (sessions[0] ? String(sessions[0].id) : '');
        select.innerHTML = '';
        if (!sessions.length) {
            select.innerHTML = '<option value="">Chưa có đợt</option>';
            this.progressMatrixSessionId = '';
            return;
        }
        sessions.forEach(s => {
            const opt = document.createElement('option');
            opt.value = String(s.id);
            opt.textContent = `${s.battalionName || 'Đợt'} · ${s.status} · ${s.opensAt || ''}`;
            select.appendChild(opt);
        });
        if (!sessions.some(s => String(s.id) === current)) {
            this.progressMatrixSessionId = String(sessions[0].id);
        } else {
            this.progressMatrixSessionId = current;
        }
        select.value = this.progressMatrixSessionId;
    }

    async loadProgressMatrix() {
        const thead = $('progressMatrixHead');
        const tbody = $('progressMatrixBody');
        if (!thead || !tbody) return;
        const sessionId = parseInt(this.progressMatrixSessionId, 10);
        if (!sessionId) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td class="empty-cell">Chưa có đợt kiểm tra.</td></tr>';
            return;
        }
        try {
            const matrix = await checkExamApi.loadProgressMatrix(sessionId);
            this.renderProgressMatrix(matrix);
        } catch (err) {
            handleError(err, { context: 'AdminController.loadProgressMatrix', fallbackKey: 'NETWORK' });
        }
    }

    renderProgressMatrix(matrix) {
        const thead = $('progressMatrixHead');
        const tbody = $('progressMatrixBody');
        if (!thead || !tbody) return;
        const columns = matrix.columns || [];
        const rows = matrix.rows || [];
        thead.innerHTML =
            '<tr><th>Tiểu đoàn</th>' +
            columns.map(col => `<th>${escapeAttr(col.title)}</th>`).join('') +
            '</tr>';
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="empty-cell">Đợt chưa gắn tiểu đoàn.</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        rows.forEach(row => {
            const tr = document.createElement('tr');
            const cells = columns
                .map(col => {
                    const cell = row.cells?.[col.key];
                    if (!cell) return '<td class="matrix-dash">—</td>';
                    const roster = cell.roster ?? row.roster ?? 0;
                    return `<td>${cell.taken}/${roster}</td>`;
                })
                .join('');
            tr.innerHTML = `<td>${escapeAttr(row.battalionName)}</td>${cells}`;
            tbody.appendChild(tr);
        });
    }

    renderExamSessionTable() {
        const tbody = $('examSessionTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const sessions = this.examSessions || [];
        if (!sessions.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Chưa có đợt kiểm tra.</td></tr>';
            return;
        }
        sessions.forEach(s => {
            const tr = document.createElement('tr');
            const typeLabel = 'Lĩnh vực + Trộn';
            let actions = '';
            if (s.status === 'draft') {
                actions += `<button class="btn-sm btn-green exam-open" data-id="${s.id}">Mở</button> `;
            }
            if (s.status === 'open') {
                actions += `<button class="btn-sm btn-delete exam-close" data-id="${s.id}">Đóng</button> `;
            }
            if (s.status !== 'open') {
                actions += `<button class="btn-sm btn-blue exam-regen" data-id="${s.id}">Tái tạo đề</button> `;
            }
            const regenBadge = s.needsRegeneration
                ? '<span class="status-badge status-pending">Cần tái tạo</span>'
                : '';
            tr.innerHTML =
                `<td>${escapeAttr(s.battalionName || '')}</td>` +
                `<td>${escapeAttr(typeLabel)}</td>` +
                `<td>${s.questionsPerSet} × ${s.numberOfSets} bộ</td>` +
                `<td>${escapeAttr(s.opensAt)} → ${escapeAttr(s.closesAt)}</td>` +
                `<td><span class="status-badge">${s.status}</span> ${regenBadge}</td>` +
                `<td class="actions-cell">${actions}</td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.exam-open').forEach(btn => {
            btn.onclick = () => this.openExamSession(parseInt(btn.dataset.id, 10));
        });
        tbody.querySelectorAll('.exam-close').forEach(btn => {
            btn.onclick = () => this.closeExamSession(parseInt(btn.dataset.id, 10));
        });
        tbody.querySelectorAll('.exam-regen').forEach(btn => {
            btn.onclick = () => this.regenerateExamSession(parseInt(btn.dataset.id, 10));
        });
    }

    openExamSessionModal() {
        const list = $('examSessionBattalionList');
        list.innerHTML = '';
        this.battalions
            .filter(b => b.isActive)
            .forEach(b => {
                const label = document.createElement('label');
                label.className = 'checkbox-label';
                label.innerHTML =
                    `<input type="checkbox" class="exam-battalion-chk" value="${b.id}"> ${escapeAttr(b.name)}`;
                list.appendChild(label);
            });
        ModalManager.open('examSessionModal');
    }

    async saveExamSession() {
        const battalionIds = Array.from(document.querySelectorAll('.exam-battalion-chk:checked')).map(
            el => parseInt(el.value, 10)
        );
        if (!battalionIds.length) {
            Toast.warning('Vui lòng chọn ít nhất một tiểu đoàn.');
            return;
        }
        const body = {
            battalionIds,
            type: 'mixed',
            questionsPerSet: parseInt($('examSessionQPerSet').value, 10),
            numberOfSets: parseInt($('examSessionNumSets').value, 10),
            durationMinutes: parseInt($('examSessionDuration').value, 10),
            opensAt: new Date($('examSessionOpensAt').value).toISOString(),
            closesAt: new Date($('examSessionClosesAt').value).toISOString()
        };
        showLoading('Đang tạo...');
        try {
            await checkExamApi.createSessionAdmin(body);
            ModalManager.close('examSessionModal');
            Toast.success('Đã tạo đợt kiểm tra.');
            await this.loadExamSessions();
        } catch (err) {
            Toast.error(err.message || 'Tạo đợt thất bại.');
        } finally {
            hideLoading();
        }
    }

    openExamSession(id) {
        const session = (this.examSessions || []).find(s => s.id === id);
        const needsConfirm = session?.needsRegeneration;
        const run = async (confirmRegenerate = false) => {
            showLoading('Đang mở đợt...');
            try {
                await checkExamApi.openSessionAdmin(id, confirmRegenerate);
                Toast.success('Đã mở đợt kiểm tra.');
                await this.loadExamSessions();
            } catch (err) {
                if (String(err.message).includes('tái tạo')) {
                    ModalManager.confirm({
                        title: 'Tái tạo bộ đề',
                        message:
                            'Ngân hàng câu hỏi đã thay đổi. Cần tái tạo bộ đề trước khi mở đợt. Tiếp tục?',
                        onConfirm: () => run(true)
                    });
                } else {
                    Toast.error(err.message || 'Mở đợt thất bại.');
                }
            } finally {
                hideLoading();
            }
        };
        if (needsConfirm) {
            ModalManager.confirm({
                title: 'Tái tạo bộ đề',
                message: 'Đợt được đánh dấu cần tái tạo bộ đề. Xác nhận mở và tái tạo?',
                onConfirm: () => run(true)
            });
        } else {
            run(false);
        }
    }

    async closeExamSession(id) {
        showLoading('Đang đóng đợt...');
        try {
            await checkExamApi.closeSessionAdmin(id);
            Toast.success('Đã đóng đợt.');
            await this.loadExamSessions();
        } catch (err) {
            Toast.error(err.message || 'Đóng đợt thất bại.');
        } finally {
            hideLoading();
        }
    }

    async regenerateExamSession(id) {
        showLoading('Đang tái tạo...');
        try {
            await checkExamApi.regenerateSessionAdmin(id);
            Toast.success('Đã tái tạo bộ đề.');
            await this.loadExamSessions();
        } catch (err) {
            Toast.error(err.message || 'Tái tạo thất bại.');
        } finally {
            hideLoading();
        }
    }

    bindExamEvents() {
        const addBtn = $('btnAddExamSession');
        if (addBtn) addBtn.onclick = () => this.openExamSessionModal();
        const cancelBtn = $('btnCancelExamSession');
        if (cancelBtn) cancelBtn.onclick = () => ModalManager.close('examSessionModal');
        const saveBtn = $('btnSaveExamSession');
        if (saveBtn) saveBtn.onclick = () => this.saveExamSession();
        const matrixSelect = $('progressMatrixSession');
        if (matrixSelect) {
            matrixSelect.onchange = () => {
                this.progressMatrixSessionId = matrixSelect.value;
                this.loadProgressMatrix();
            };
        }
    }

    // ——— Exam history (admin) ———

    bindHistoryEvents() {
        $('btnReloadHistory').onclick = () => this.loadHistoryTable();

        const typeFilter = $('historyTypeFilter');
        if (typeFilter) {
            typeFilter.value = this.historyTypeFilter;
            typeFilter.onchange = () => {
                this.historyTypeFilter = typeFilter.value;
                this.loadHistoryTable();
            };
        }
        const battalionFilter = $('historyBattalionFilter');
        if (battalionFilter) {
            battalionFilter.onchange = () => {
                this.historyBattalionFilter = battalionFilter.value;
                this.loadHistoryTable();
            };
        }

        $('historySearchInput').oninput = e => {
            this.historySearchQuery = e.target.value.trim();
            if (this._historySearchTimer) clearTimeout(this._historySearchTimer);
            this._historySearchTimer = setTimeout(() => {
                if ($('panelHistory').classList.contains('active')) {
                    this.loadHistoryTable();
                }
            }, 350);
        };
    }

    async loadHistoryTable() {
        showLoading('Đang tải lịch sử Kiểm tra...');
        try {
            const type = this.historyTypeFilter || 'check';
            const branch = type === 'topic' || type === 'mixed' ? type : '';
            this.historyRecords = await checkExamApi.loadCheckHistoryAdmin({
                limit: 200,
                search: this.historySearchQuery,
                battalionId: this.historyBattalionFilter,
                branch
            });
            this.renderHistoryTable();
        } catch (err) {
            handleError(err, { context: 'AdminController.loadHistoryTable', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    renderHistoryTable() {
        const emptyMessage = this.historySearchQuery
            ? 'Không tìm thấy kết quả Kiểm tra phù hợp.'
            : 'Chưa có kết quả Kiểm tra nào trong hệ thống.';
        const records = this.historyRecords || [];
        const countEl = $('statHistoryCount');
        const shownEl = $('statHistoryShown');
        if (countEl) countEl.textContent = String(records.length);
        if (shownEl) shownEl.textContent = String(records.length);
        renderAdminHistoryTable($('historyTableBody'), records, emptyMessage);
    }
}
