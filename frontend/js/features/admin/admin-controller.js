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

/**
 * Admin panel controller — CRUD topics/questions, Excel, user management.
 */
export class AdminController {
    constructor() {
        /** @type {object|null} */
        this.quizData = null;
        this.selectedTopicIdx = 0;
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
        showLoading('Đang tải...');

        try {
            await auth.initUsers();
            await this._loadData();

            $('adminUserName').textContent = currentUser.fullName || 'Admin';

            this.renderStats();
            this.renderTopicList();
            this.renderQuestionList();
            this.bindEvents();
            this.bindUserEvents();
            this.bindHistoryEvents();
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

    renderStats() {
        $('statTopics').textContent = this.quizData.topics.length;
        $('statQuestions').textContent = countAllQuestions(this.quizData);
        $('statTitle').textContent = this.quizData.title || '—';
    }

    renderTopicList() {
        const list = $('topicList');
        list.innerHTML = '';
        this.quizData.topics.forEach((topic, idx) => {
            const li = document.createElement('li');
            li.className = 'admin-topic-item' + (idx === this.selectedTopicIdx ? ' active' : '');
            li.innerHTML =
                `<span class="topic-name">${escapeAttr(topic.title)}</span>` +
                `<span class="topic-count">${topic.questions.length}</span>`;
            li.onclick = () => {
                this.selectedTopicIdx = idx;
                this.renderTopicList();
                this.renderQuestionList();
            };
            list.appendChild(li);
        });
    }

    renderQuestionList() {
        const topic = this.quizData.topics[this.selectedTopicIdx];
        if (!topic) return;

        $('currentTopicTitle').textContent = topic.title;
        $('questionCountBadge').textContent = topic.questions.length + ' câu';

        const tbody = $('questionTableBody');
        tbody.innerHTML = '';

        topic.questions.forEach((q, idx) => {
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

    openTopicModal(editIdx) {
        $('topicModalTitle').textContent = editIdx >= 0 ? 'Sửa chủ đề' : 'Thêm chủ đề';
        $('topicNameInput').value = editIdx >= 0 ? this.quizData.topics[editIdx].title : '';
        $('topicModal').dataset.editIdx = editIdx;
        ModalManager.open('topicModal');
    }

    async saveTopic() {
        const title = $('topicNameInput').value.trim();
        if (!title) return Toast.warning('Vui lòng nhập tên chủ đề.');
        const editIdx = parseInt($('topicModal').dataset.editIdx, 10);
        if (editIdx >= 0) {
            this.quizData.topics[editIdx].title = title;
        } else {
            this.quizData.topics.push({ title, questions: [] });
            this.selectedTopicIdx = this.quizData.topics.length - 1;
        }
        ModalManager.close('topicModal');
        await this.saveData();
    }

    deleteTopic() {
        if (this.quizData.topics.length <= 1) return Toast.warning('Phải giữ ít nhất một chủ đề.');
        const topic = this.quizData.topics[this.selectedTopicIdx];
        ModalManager.confirm({
            title: 'Xóa chủ đề',
            message: `Xóa chủ đề "${topic.title}" và ${topic.questions.length} câu hỏi?`,
            onConfirm: async () => {
                this.quizData.topics.splice(this.selectedTopicIdx, 1);
                this.selectedTopicIdx = Math.max(0, this.selectedTopicIdx - 1);
                await this.saveData();
            }
        });
    }

    clearAllQuestionsInTopic() {
        const topic = this.quizData.topics[this.selectedTopicIdx];
        if (!topic) return;
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
        const topic = this.quizData.topics[this.selectedTopicIdx];
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
        const topic = this.quizData.topics[this.selectedTopicIdx];
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
                this.quizData.topics[this.selectedTopicIdx].questions.splice(idx, 1);
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

                const currentTopic = this.quizData.topics[this.selectedTopicIdx];
                if (!currentTopic) {
                    return Toast.error('Chưa có chủ đề nào được chọn.');
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
                                currentTopic.id ||
                                (await this._getTopicIdByIndex(this.selectedTopicIdx));

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
    async _getTopicIdByIndex(idx) {
        try {
            const freshData = await quizRepo.loadQuizData();
            return freshData.topics[idx]?.id;
        } catch {
            return null;
        }
    }

    bindEvents() {
        $('btnAddTopic').onclick = () => this.openTopicModal(-1);
        $('btnEditTopic').onclick = () => this.openTopicModal(this.selectedTopicIdx);
        $('btnDeleteTopic').onclick = () => this.deleteTopic();
        $('btnClearAllQuestions').onclick = () => this.clearAllQuestionsInTopic();
        $('btnSaveTopic').onclick = () => this.saveTopic();
        $('btnCancelTopic').onclick = () => ModalManager.close('topicModal');

        $('btnAddQuestion').onclick = () => this.openQuestionModal(-1);
        $('btnSaveQuestion').onclick = () => this.saveQuestion();
        $('btnCancelQuestion').onclick = () => ModalManager.close('questionModal');
        $('qTypeSelect').onchange = () => {
            this.updateAnswersLabel();
            const existing = this.readAnswersFromRows();
            this.buildAnswerRows(existing.length ? existing : null);
        };
        $('btnAddAnswer').onclick = () =>
            this.addAnswerRow({ html: '', isCorrect: false }, $('answerRows').children.length);

        $('btnImportExcel').onclick = () => $('fileImportExcel').click();
        $('fileImportExcel').onchange = e => {
            const file = e.target.files[0];
            if (file) this.importExcel(file);
            e.target.value = '';
        };

        $('btnExportExcel').onclick = () => exportWorkbook(this.quizData);
        this.setupTemplateMenu();

        $('btnGoQuiz').onclick = () => {
            window.location.href = ROUTES.QUIZ;
        };
        $('btnLogout').onclick = () => {
            ModalManager.confirm({
                title: 'Đăng xuất',
                message: 'Bạn có muốn đăng xuất?',
                onConfirm: async () => {
                    await auth.logout();
                    window.location.href = ROUTES.LOGIN;
                }
            });
        };
    }

    setupTemplateMenu() {
        renderTemplateMenu($('templateMenu'));
        $('btnExportTemplate').onclick = e => {
            e.stopPropagation();
            $('templateMenu').classList.toggle('open');
        };
        document.addEventListener('click', () => $('templateMenu').classList.remove('open'));
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
