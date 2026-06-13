/**
 * Logic trang Admin: CRUD Topic/Question, Import/Export Excel
 */
const TSQCB_Admin = (function () {
    let quizData = null;
    let selectedTopicIdx = 0;
    let editingQuestionIdx = -1;
    let userTab = 'pending';
    let userSearchQuery = '';

    const $ = TSQCB_Utils.$;

    function renderStats() {
        const total = TSQCB_Utils.countAllQuestions(quizData);
        $('statTopics').textContent = quizData.topics.length;
        $('statQuestions').textContent = total;
        $('statTitle').textContent = quizData.title || '—';
    }

    function renderTopicList() {
        const list = $('topicList');
        list.innerHTML = '';
        quizData.topics.forEach((topic, idx) => {
            const li = document.createElement('li');
            li.className = 'admin-topic-item' + (idx === selectedTopicIdx ? ' active' : '');
            li.innerHTML = '<span class="topic-name">' + topic.title + '</span>' +
                '<span class="topic-count">' + topic.questions.length + '</span>';
            li.onclick = () => { selectedTopicIdx = idx; renderTopicList(); renderQuestionList(); };
            list.appendChild(li);
        });
    }

    function renderQuestionList() {
        const topic = quizData.topics[selectedTopicIdx];
        if (!topic) return;

        $('currentTopicTitle').textContent = topic.title;
        $('questionCountBadge').textContent = topic.questions.length + ' câu';

        const tbody = $('questionTableBody');
        tbody.innerHTML = '';

        topic.questions.forEach((q, idx) => {
            const tr = document.createElement('tr');
            const preview = TSQCB_Utils.htmlToText(q.contentHtml).substring(0, 80);
            const correctLetters = q.answers.filter(a => a.isCorrect).map(a => a.letter).join(', ');
            tr.innerHTML =
                '<td>' + (q.id || '—') + '</td>' +
                '<td class="q-preview">' + preview + (preview.length >= 80 ? '...' : '') + '</td>' +
                '<td>' + TSQCB_Utils.getQuestionTypeLabel(q.type) + '</td>' +
                '<td>' + correctLetters + '</td>' +
                '<td class="actions-cell">' +
                '<button class="btn-sm btn-edit" data-idx="' + idx + '">Sửa</button>' +
                '<button class="btn-sm btn-delete" data-idx="' + idx + '">Xóa</button></td>';
            tr.querySelector('.btn-edit').onclick = () => openQuestionModal(idx);
            tr.querySelector('.btn-delete').onclick = () => deleteQuestion(idx);
            tbody.appendChild(tr);
        });
    }

    function saveData() {
        quizData = TSQCB_Storage.saveLocalData(quizData);
        renderStats();
        renderTopicList();
        renderQuestionList();
    }

    function openTopicModal(editIdx) {
        $('topicModalTitle').textContent = editIdx >= 0 ? 'Sửa chủ đề' : 'Thêm chủ đề';
        $('topicNameInput').value = editIdx >= 0 ? quizData.topics[editIdx].title : '';
        $('topicModal').dataset.editIdx = editIdx;
        $('topicModal').classList.add('active');
    }

    function saveTopic() {
        const title = $('topicNameInput').value.trim();
        if (!title) return alert('Vui lòng nhập tên chủ đề.');
        const editIdx = parseInt($('topicModal').dataset.editIdx);
        if (editIdx >= 0) {
            quizData.topics[editIdx].title = title;
        } else {
            quizData.topics.push({ title, questions: [] });
            selectedTopicIdx = quizData.topics.length - 1;
        }
        $('topicModal').classList.remove('active');
        saveData();
    }

    function deleteTopic() {
        if (quizData.topics.length <= 1) return alert('Phải giữ ít nhất một chủ đề.');
        const topic = quizData.topics[selectedTopicIdx];
        if (!confirm('Xóa chủ đề "' + topic.title + '" và ' + topic.questions.length + ' câu hỏi?')) return;
        quizData.topics.splice(selectedTopicIdx, 1);
        selectedTopicIdx = Math.max(0, selectedTopicIdx - 1);
        saveData();
    }

    function clearAllQuestionsInTopic() {
        const topic = quizData.topics[selectedTopicIdx];
        if (!topic) return;
        if (!topic.questions.length) return alert('Chủ đề này chưa có câu hỏi.');
        if (!confirm('Xóa hết ' + topic.questions.length + ' câu hỏi trong chủ đề "' + topic.title + '"?\nChủ đề vẫn được giữ lại.')) return;
        topic.questions = [];
        saveData();
    }

    function isEssayMode() {
        const t = $('qTypeSelect').value;
        return t === 'essayquestion' || t === 'Fillintheblank';
    }

    function readAnswersFromRows() {
        const answers = [];
        document.querySelectorAll('#answerRows .answer-row').forEach((row, i) => {
            const el = row.querySelector('.ans-html');
            if (!el) return;
            const text = el.value.trim();
            if (!text) return;
            const correctEl = row.querySelector('.ans-correct');
            answers.push({
                letter: TSQCB_CONFIG.ANSWER_LABELS[i] || String.fromCharCode(65 + i),
                html: TSQCB_Excel.textToHtml(text),
                isCorrect: correctEl ? correctEl.checked : true
            });
        });
        return answers;
    }

    function buildAnswerRows(answers) {
        const container = $('answerRows');
        container.innerHTML = '';
        const btnAdd = $('btnAddAnswer');

        if (isEssayMode()) {
            if (btnAdd) btnAdd.style.display = 'none';
            const cor = (answers && answers.length)
                ? answers.find(a => a.isCorrect) || answers[0]
                : { html: '', isCorrect: true };
            addEssayAnswerRow(cor);
            return;
        }

        if (btnAdd) btnAdd.style.display = '';
        const ans = answers && answers.length ? answers : [
            { letter: 'A', html: '', isCorrect: false },
            { letter: 'B', html: '', isCorrect: false },
            { letter: 'C', html: '', isCorrect: false },
            { letter: 'D', html: '', isCorrect: false }
        ];
        ans.forEach((a, i) => addAnswerRow(a, i));
    }

    function addEssayAnswerRow(data) {
        const container = $('answerRows');
        const row = document.createElement('div');
        row.className = 'answer-row answer-row-essay';
        row.innerHTML =
            '<label class="answer-essay-label">Đáp án mẫu <span class="hint-inline">(Enter để xuống dòng như Excel)</span></label>' +
            '<textarea class="ans-html ans-textarea" rows="10" placeholder="Nhập đáp án mẫu, giữ nguyên xuống dòng"></textarea>';
        row.querySelector('.ans-html').value = TSQCB_Excel.htmlToEditText(data.html || '');
        container.appendChild(row);
    }

    function addAnswerRow(data, idx) {
        const container = $('answerRows');
        const row = document.createElement('div');
        row.className = 'answer-row';
        row.innerHTML =
            '<label class="answer-correct"><input type="checkbox" class="ans-correct"' + (data.isCorrect ? ' checked' : '') + '> ' + (TSQCB_CONFIG.ANSWER_LABELS[idx] || String.fromCharCode(65 + idx)) + '</label>' +
            '<input type="text" class="ans-html" placeholder="Nội dung đáp án" value="' + TSQCB_Utils.escapeAttr(TSQCB_Utils.htmlToText(data.html)) + '">' +
            '<button type="button" class="btn-sm btn-delete remove-ans">×</button>';
        row.querySelector('.remove-ans').onclick = () => row.remove();
        container.appendChild(row);
    }

    function openQuestionModal(qIdx) {
        editingQuestionIdx = qIdx;
        const topic = quizData.topics[selectedTopicIdx];
        const q = qIdx >= 0 ? topic.questions[qIdx] : null;

        $('questionModalTitle').textContent = qIdx >= 0 ? 'Sửa câu hỏi' : 'Thêm câu hỏi';
        $('qIdInput').value = q ? (q.id || '') : TSQCB_Utils.nextQuestionId(quizData);
        $('qContentInput').value = q ? TSQCB_Excel.htmlToEditText(q.contentHtml) : '';
        $('qTypeSelect').value = q ? q.type : 'multiplechoice';
        $('qNoShuffle').checked = q ? !!q.noShuffle : false;
        updateAnswersLabel();
        buildAnswerRows(q ? q.answers : null);
        $('questionModal').classList.add('active');
    }

    function updateAnswersLabel() {
        const label = $('answersLabel');
        if (!label) return;
        label.textContent = isEssayMode()
            ? 'Đáp án mẫu (Enter để xuống dòng như Excel)'
            : 'Đáp án (tick ✓ = đáp án đúng)';
    }

    function collectQuestionFromForm() {
        const content = $('qContentInput').value.trim();
        if (!content) return alert('Vui lòng nhập nội dung câu hỏi.'), null;

        const type = $('qTypeSelect').value;
        let answers = readAnswersFromRows();

        if (type === 'essayquestion' || type === 'Fillintheblank') {
            if (!answers.length) return alert('Vui lòng nhập đáp án mẫu.'), null;
            answers = [{ letter: 'A', html: answers[0].html, isCorrect: true }];
        } else {
            if (answers.length < 2) return alert('Cần ít nhất 2 đáp án.'), null;
            if (!answers.some(a => a.isCorrect)) return alert('Chọn ít nhất một đáp án đúng.'), null;
        }

        const q = {
            id: parseInt($('qIdInput').value) || TSQCB_Utils.nextQuestionId(quizData),
            contentHtml: TSQCB_Excel.textToHtml(content),
            type,
            noShuffle: $('qNoShuffle').checked,
            answers
        };
        q.hash = TSQCB_Utils.hashStr(q.contentHtml);
        return q;
    }

    function saveQuestion() {
        const q = collectQuestionFromForm();
        if (!q) return;
        const topic = quizData.topics[selectedTopicIdx];
        if (editingQuestionIdx >= 0) {
            topic.questions[editingQuestionIdx] = q;
        } else {
            topic.questions.push(q);
        }
        $('questionModal').classList.remove('active');
        saveData();
    }

    function deleteQuestion(idx) {
        if (!confirm('Xóa câu hỏi này?')) return;
        quizData.topics[selectedTopicIdx].questions.splice(idx, 1);
        saveData();
    }

    /** Import Excel — merge theo tên file = tên chủ đề */
    function importExcel(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const { topicTitle, questions } = TSQCB_Excel.importWorkbook(wb, file.name);

                if (!questions.length) {
                    return alert('Không đọc được câu hỏi nào.\n\nKiểm tra định dạng:\n• Trắc nghiệm: Câu hỏi | Phương án | Đáp án đúng\n• Tự luận: Câu hỏi | Câu trả lời');
                }

                const mc = questions.filter(q => q.type === 'multiplechoice').length;
                const essay = questions.filter(q => q.type === 'essayquestion').length;
                const existingIdx = quizData.topics.findIndex(t => t.title === topicTitle);
                const msg = existingIdx >= 0
                    ? `Chủ đề "${topicTitle}" đã có ${quizData.topics[existingIdx].questions.length} câu.\nGhi đè bằng ${questions.length} câu mới?\n(${mc} trắc nghiệm, ${essay} tự luận)`
                    : `Import ${questions.length} câu vào chủ đề "${topicTitle}"?\n(${mc} trắc nghiệm, ${essay} tự luận)`;

                if (!confirm(msg)) return;

                let baseId = TSQCB_Utils.nextQuestionId(quizData);
                questions.forEach(q => { q.id = baseId++; });

                if (existingIdx >= 0) {
                    quizData.topics[existingIdx].questions = questions;
                    selectedTopicIdx = existingIdx;
                } else {
                    quizData.topics.push({ title: topicTitle, questions });
                    selectedTopicIdx = quizData.topics.length - 1;
                }

                saveData();
                alert('Import thành công!\n' + questions.length + ' câu → chủ đề "' + topicTitle + '"');
            } catch (err) {
                alert('Lỗi đọc Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function exportExcel() {
        TSQCB_Excel.exportWorkbook(quizData);
    }

    function setupTemplateMenu() {
        TSQCB_Excel.renderTemplateMenu($('templateMenu'));
        $('btnExportTemplate').onclick = (e) => {
            e.stopPropagation();
            $('templateMenu').classList.toggle('open');
        };
        document.addEventListener('click', () => $('templateMenu').classList.remove('open'));
    }

    // ——— Quản lý người dùng ———

    function switchSection(section) {
        document.querySelectorAll('.admin-section-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });
        $('panelQuestions').classList.toggle('active', section === 'questions');
        $('panelUsers').classList.toggle('active', section === 'users');
        if (section === 'users') renderUserTable();
    }

    function getFilteredUsers() {
        const q = userSearchQuery.toLowerCase();
        return TSQCB_Auth.getUsers().filter(u => {
            const inTab = userTab === 'pending'
                ? (u.status === 'pending' || u.status === 'rejected')
                : u.status === 'approved';
            if (!inTab) return false;
            if (!q) return true;
            return u.militaryId.includes(q) || (u.fullName || '').toLowerCase().includes(q);
        });
    }

    function updateUserTabCounts() {
        const users = TSQCB_Auth.getUsers();
        const pending = users.filter(u => u.status === 'pending' || u.status === 'rejected').length;
        const approved = users.filter(u => u.status === 'approved').length;
        $('pendingCount').textContent = pending;
        $('approvedCount').textContent = approved;
    }

    function statusBadgeClass(status) {
        if (status === 'approved') return 'status-approved';
        if (status === 'rejected') return 'status-rejected';
        return 'status-pending';
    }

    function renderUserTable() {
        updateUserTabCounts();
        const tbody = $('userTableBody');
        tbody.innerHTML = '';
        const users = getFilteredUsers();

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Không có user nào.</td></tr>';
            return;
        }

        users.forEach(u => {
            const tr = document.createElement('tr');
            const isAdmin = u.role === 'admin';
            const isPending = u.status === 'pending';
            let actions = '';

            if (isPending && !isAdmin) {
                actions += '<button class="btn-sm btn-green user-approve" data-id="' + u.militaryId + '">Duyệt</button> ';
                actions += '<button class="btn-sm btn-delete user-reject" data-id="' + u.militaryId + '">Từ chối</button> ';
            }
            actions += '<button class="btn-sm btn-edit user-edit" data-id="' + u.militaryId + '">Sửa</button> ';
            actions += '<button class="btn-sm btn-blue user-reset" data-id="' + u.militaryId + '">Reset MK</button> ';
            if (!isAdmin || TSQCB_Auth.getUsers().filter(x => x.role === 'admin').length > 1) {
                actions += '<button class="btn-sm btn-delete user-delete" data-id="' + u.militaryId + '">Xóa</button>';
            }

            tr.innerHTML =
                '<td><code class="user-id">' + u.militaryId + '</code></td>' +
                '<td>' + TSQCB_Utils.escapeAttr(u.fullName || '—') + '</td>' +
                '<td><span class="role-badge role-' + u.role + '">' + (u.role === 'admin' ? 'Admin' : 'User') + '</span></td>' +
                '<td><span class="status-badge ' + statusBadgeClass(u.status) + '">' + TSQCB_Auth.getStatusLabel(u.status) + '</span></td>' +
                '<td class="actions-cell user-actions">' + actions + '</td>';
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.user-approve').forEach(btn => {
            btn.onclick = () => approveUser(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-reject').forEach(btn => {
            btn.onclick = () => rejectUser(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-edit').forEach(btn => {
            btn.onclick = () => openEditUserModal(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-reset').forEach(btn => {
            btn.onclick = () => openResetPwdModal(btn.dataset.id);
        });
        tbody.querySelectorAll('.user-delete').forEach(btn => {
            btn.onclick = () => deleteUser(btn.dataset.id);
        });
    }

    async function approveUser(militaryId) {
        const result = await TSQCB_Auth.approveUser(militaryId);
        if (!result.ok) return alert(result.message);
        renderUserTable();
    }

    async function rejectUser(militaryId) {
        if (!confirm('Từ chối tài khoản ' + militaryId + '?')) return;
        const result = await TSQCB_Auth.rejectUser(militaryId);
        if (!result.ok) return alert(result.message);
        renderUserTable();
    }

    async function deleteUser(militaryId) {
        const user = TSQCB_Auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;
        if (!confirm('Xóa user "' + user.fullName + '" (' + militaryId + ')?')) return;
        const result = await TSQCB_Auth.deleteUser(militaryId);
        if (!result.ok) return alert(result.message);
        renderUserTable();
    }

    function openEditUserModal(militaryId) {
        const user = TSQCB_Auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;

        $('editUserMilitaryId').value = user.militaryId;
        $('editUserIdDisplay').value = user.militaryId;
        $('editUserFullName').value = user.fullName || '';
        $('editUserRole').value = user.role || 'user';
        $('editUserStatus').value = user.status || 'pending';

        const isAdmin = user.role === 'admin';
        $('editUserRole').disabled = isAdmin;
        $('editUserStatus').disabled = isAdmin;

        $('userEditModal').classList.add('active');
    }

    async function saveEditUser() {
        const militaryId = $('editUserMilitaryId').value;
        const result = await TSQCB_Auth.updateUser(militaryId, {
            fullName: $('editUserFullName').value,
            role: $('editUserRole').value,
            status: $('editUserStatus').value
        });
        if (!result.ok) return alert(result.message);
        $('userEditModal').classList.remove('active');
        renderUserTable();
    }

    function openResetPwdModal(militaryId) {
        const user = TSQCB_Auth.getUsers().find(u => u.militaryId === militaryId);
        if (!user) return;
        $('resetPwdMilitaryId').value = militaryId;
        $('resetPwdUserLabel').textContent = user.fullName + ' (' + militaryId + ')';
        $('resetPwdNew').value = '';
        $('userResetPwdModal').classList.add('active');
    }

    async function confirmResetPwd() {
        const militaryId = $('resetPwdMilitaryId').value;
        const newPassword = $('resetPwdNew').value;
        const result = await TSQCB_Auth.resetPassword(militaryId, newPassword);
        if (!result.ok) return alert(result.message);
        $('userResetPwdModal').classList.remove('active');
        alert('Đã reset mật khẩu thành công.');
    }

    function bindUserEvents() {
        document.querySelectorAll('.admin-section-btn').forEach(btn => {
            btn.onclick = () => switchSection(btn.dataset.section);
        });

        document.querySelectorAll('.user-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                userTab = tab.dataset.usertab;
                renderUserTable();
            };
        });

        $('userSearchInput').oninput = (e) => {
            userSearchQuery = e.target.value.trim();
            renderUserTable();
        };

        $('btnCancelEditUser').onclick = () => $('userEditModal').classList.remove('active');
        $('btnSaveEditUser').onclick = saveEditUser;
        $('btnCancelResetPwd').onclick = () => $('userResetPwdModal').classList.remove('active');
        $('btnConfirmResetPwd').onclick = confirmResetPwd;
    }

    function bindEvents() {
        $('btnAddTopic').onclick = () => openTopicModal(-1);
        $('btnEditTopic').onclick = () => openTopicModal(selectedTopicIdx);
        $('btnDeleteTopic').onclick = deleteTopic;
        $('btnClearAllQuestions').onclick = clearAllQuestionsInTopic;
        $('btnSaveTopic').onclick = saveTopic;
        $('btnCancelTopic').onclick = () => $('topicModal').classList.remove('active');

        $('btnAddQuestion').onclick = () => openQuestionModal(-1);
        $('btnSaveQuestion').onclick = saveQuestion;
        $('btnCancelQuestion').onclick = () => $('questionModal').classList.remove('active');
        $('qTypeSelect').onchange = () => {
            updateAnswersLabel();
            const existing = readAnswersFromRows();
            buildAnswerRows(existing.length ? existing : null);
        };
        $('btnAddAnswer').onclick = () => addAnswerRow({ html: '', isCorrect: false }, $('answerRows').children.length);

        $('btnImportExcel').onclick = () => $('fileImportExcel').click();
        $('fileImportExcel').onchange = (e) => {
            const file = e.target.files[0];
            if (file) importExcel(file);
            e.target.value = '';
        };

        $('btnExportExcel').onclick = exportExcel;
        setupTemplateMenu();

        $('btnGoQuiz').onclick = () => { window.location.href = 'index.html'; };
        $('btnLogout').onclick = () => {
            TSQCB_Auth.logout();
            window.location.href = 'login.html';
        };
    }

    async function init() {
        if (!TSQCB_Auth.requireAdmin()) return;
        await TSQCB_Auth.initUsers();

        try {
            quizData = await TSQCB_Storage.loadQuizData();
            if (!TSQCB_Storage.getLocalData()) {
                TSQCB_Storage.saveLocalData(quizData);
            }
        } catch (err) {
            quizData = TSQCB_Storage.normalizeData({ title: TSQCB_CONFIG.APP_NAME, topics: [] });
        }

        if (TSQCB_Excel.repairEssayQuestions(quizData)) {
            TSQCB_Storage.saveLocalData(quizData);
        }

        const currentUser = TSQCB_Auth.getCurrentUser();
        $('adminUserName').textContent = currentUser ? currentUser.fullName : 'Admin';
        renderStats();
        renderTopicList();
        renderQuestionList();
        bindEvents();
        bindUserEvents();
        renderUserTable();
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => TSQCB_Admin.init());
