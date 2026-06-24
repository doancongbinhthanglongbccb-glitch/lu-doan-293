import { APP_CONFIG, ROUTES } from '../../config/index.js';
import { $ } from '../../utils/dom.js';
import { htmlToText, escapeAttr } from '../../utils/html.js';
import { clone } from '../../utils/array.js';
import { assignQuestionHash } from '../../utils/hash.js';
import {
    countAllQuestions,
    getQuestionTypeLabel,
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
import { unwrapPayload } from '../../services/api/api-response.js';
import {
    isTopicParent,
    isTopicLeaf,
    resolveTopicRef,
    getTopicDisplayTitle,
    topicQuestionCount,
    countLeafTopics,
    countParentTopics
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
        /** @type {object[]} */
        this.historyRecords = [];
        this._historySearchTimer = null;
    }

    /** Initialize admin panel */
    async init() {
        const currentUser = await auth.requireAdminAsync();
        if (!currentUser) return;

        $('adminUserName').textContent = currentUser.fullName || 'Admin';
        this.bindEvents();
        this.bindUserEvents();
        this.bindHistoryEvents();

        showLoading('Đang tải...');

        try {
            await auth.initUsers();
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
            this.quizData = await quizRepo.saveQuizData(this.quizData);
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
                parentRow.innerHTML =
                    `<span class="topic-name">${escapeAttr(topic.title)}</span>` +
                    '<button type="button" class="btn-topic-add-child" title="Thêm môn con">+</button>' +
                    `<span class="topic-count">${topicQuestionCount(topic)}</span>`;
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
                    li.innerHTML =
                        `<span class="topic-name">${escapeAttr(child.title)}</span>` +
                        `<span class="topic-count">${(child.questions || []).length}</span>`;
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
                li.innerHTML =
                    `<span class="topic-name">${escapeAttr(topic.title)}</span>` +
                    '<button type="button" class="btn-topic-add-child" title="Thêm môn con">+</button>' +
                    `<span class="topic-count">${(topic.questions || []).length}</span>`;
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
                '<tr><td colspan="5" class="empty-cell">Nhóm này đã có môn con — chọn một môn con bên trái để quản lý câu hỏi.</td></tr>';
            return;
        }

        if (!topic) {
            $('questionCountBadge').textContent = '0 câu';
            $('questionTableBody').innerHTML =
                '<tr><td colspan="5" class="empty-cell">Chưa có dữ liệu chủ đề.</td></tr>';
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
                `<td>${q.id || '—'}</td>` +
                `<td class="q-preview">${escapeAttr(preview)}${preview.length >= 80 ? '...' : ''}</td>` +
                `<td>${getQuestionTypeLabel(q.type)}</td>` +
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
        const snapshot = clone(this.quizData);
        try {
            this.quizData = await quizRepo.saveQuizData(this.quizData);
            this.renderStats();
            this.renderTopicList();
            this.renderQuestionList();
        } catch (err) {
            this.quizData = snapshot;
            Toast.error(err.message || 'Không lưu được dữ liệu.');
            throw err;
        }
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
            parent.children.push({ title, questions: [] });
            this.selectedTopicRef = { p, c: parent.children.length - 1 };
        } else if (mode === 'edit' && ref) {
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
        const t = $('qTypeSelect').value;
        return t === 'essayquestion' || t === 'Fillintheblank';
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
        $('qTypeSelect').value = q ? q.type : 'multiplechoice';
        $('qNoShuffle').checked = q ? !!q.noShuffle : false;
        this.updateAnswersLabel();
        this.buildAnswerRows(q ? q.answers : null);
        ModalManager.open('questionModal');
    }

    updateAnswersLabel() {
        const label = $('answersLabel');
        if (!label) return;
        label.textContent = this.isEssayMode()
            ? 'Đáp án mẫu (Enter để xuống dòng như Excel)'
            : 'Đáp án (tick ✓ = đáp án đúng)';
    }

    collectQuestionFromForm() {
        const content = $('qContentInput').value.trim();
        if (!content) {
            Toast.warning('Vui lòng nhập nội dung câu hỏi.');
            return null;
        }

        const type = $('qTypeSelect').value;
        let answers = this.readAnswersFromRows();

        if (type === 'essayquestion' || type === 'Fillintheblank') {
            if (!answers.length) {
                Toast.warning('Vui lòng nhập đáp án mẫu.');
                return null;
            }
            answers = [{ letter: 'A', html: answers[0].html, isCorrect: true }];
        } else {
            if (answers.length < 2) {
                Toast.warning('Cần ít nhất 2 đáp án.');
                return null;
            }
            if (!answers.some(a => a.isCorrect)) {
                Toast.warning('Chọn ít nhất một đáp án đúng.');
                return null;
            }
        }

        const q = {
            id: parseInt($('qIdInput').value, 10) || nextQuestionId(this.quizData),
            contentHtml: textToHtml(content),
            type,
            noShuffle: $('qNoShuffle').checked,
            answers
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
                        'Không đọc được câu hỏi nào.\n\nKiểm tra định dạng:\n• Trắc nghiệm: Câu hỏi | Phương án | Đáp án đúng\n• Tự luận: Câu hỏi | Câu trả lời'
                    );
                }

                const mcCount = questions.filter(q => q.type === 'multiplechoice').length;
                const essayCount = questions.filter(
                    q => q.type === 'essayquestion' || q.type === 'Fillintheblank'
                ).length;

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

                const preview = questions
                    .slice(0, 2)
                    .map((q, i) => `${i + 1}. ${htmlToText(q.contentHtml).substring(0, 60)}`)
                    .join('\n');

                const confirmMsg =
                    `Import ${questions.length} câu vào chủ đề "${currentTopic.title}"?\n\n` +
                    `• Trắc nghiệm: ${mcCount}\n` +
                    `• Tự luận: ${essayCount}\n\n` +
                    `Xem trước:\n${preview}${questions.length > 2 ? '\n...' : ''}` +
                    (warnings.length
                        ? `\n\n⚠ ${warnings.length} cảnh báo (đáp án không khớp):\n${warnings.slice(0, 3).join('\n')}${warnings.length > 3 ? '\n...' : ''}`
                        : '');

                ModalManager.confirm({
                    title: 'Xác nhận Import',
                    message: confirmMsg,
                    onConfirm: async () => {
                        showLoading(`Đang import ${questions.length} câu hỏi...`);

                        try {
                            const topicId =
                                currentTopic.id || (await this._getSelectedTopicId());

                            if (!topicId) {
                                throw new Error('Không tìm thấy ID của chủ đề. Hãy tải lại trang.');
                            }

                            const { data } = await apiClient.post(
                                `/quiz/topics/${topicId}/import`,
                                { questions },
                                { silent: true }
                            );
                            const result = unwrapPayload(data);

                            Toast.success(
                                `Import thành công ${result.added ?? questions.length} câu hỏi!`
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
        const qTypeSelect = $('qTypeSelect');
        if (qTypeSelect) {
            qTypeSelect.onchange = () => {
                this.updateAnswersLabel();
                const existing = this.readAnswersFromRows();
                this.buildAnswerRows(existing.length ? existing : null);
            };
        }
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
            btn.classList.toggle('active', btn.dataset.section === section);
        });
        $('panelQuestions').classList.toggle('active', section === 'questions');
        $('panelUsers').classList.toggle('active', section === 'users');
        $('panelHistory').classList.toggle('active', section === 'history');
        if (section === 'users') this.renderUserTable();
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
        $('pendingCount').textContent = users.filter(u => u.status === 'pending').length;
        $('rejectedCount').textContent = users.filter(u => u.status === 'rejected').length;
        $('approvedCount').textContent = users.filter(u => u.status === 'approved').length;
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
            tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Không có user nào.</td></tr>';
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

        $('btnCancelEditUser').onclick = () => ModalManager.close('userEditModal');
        $('btnSaveEditUser').onclick = () => this.saveEditUser();
        $('btnCancelResetPwd').onclick = () => ModalManager.close('userResetPwdModal');
        $('btnConfirmResetPwd').onclick = () => this.confirmResetPwd();
    }

    // ——— Exam history (admin) ———

    bindHistoryEvents() {
        $('btnReloadHistory').onclick = () => this.loadHistoryTable();

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
        showLoading('Đang tải lịch sử thi...');
        try {
            this.historyRecords = await quizRepo.loadAllExamHistory({
                limit: 200,
                search: this.historySearchQuery
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
            ? 'Không tìm thấy lịch sử thi phù hợp.'
            : 'Chưa có lịch sử thi nào trong hệ thống.';
        renderAdminHistoryTable($('historyTableBody'), this.historyRecords, emptyMessage);
    }
}
