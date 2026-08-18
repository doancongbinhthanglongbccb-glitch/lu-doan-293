import { APP_CONFIG, QUIZ_MODES, REVIEW_SUB_MODES, FILTER_MODES, ROUTES } from '../../config/index.js';
import { $, setVisible } from '../../utils/dom.js';
import { escapeAttr } from '../../utils/html.js';
import { formatDateTime } from '../../utils/date.js';
import { store } from '../../core/store.js';
import { QuizEngine } from '../../core/quiz-engine.js';
import {
    gradeAnswer,
    hasAnswer,
    emptyAnswerState,
    isMultiSelectType,
    countAllQuestions,
    prepareQuestion
} from '../../core/grading.js';
import { quizTimer } from '../../core/timer-service.js';
import { createWrongHistoryService } from '../../core/wrong-history-service.js';
import * as quizRepo from '../../storage/quiz-repository.js';
import { repairEssayQuestions } from '../../services/excel/index.js';
import { auth } from '../../services/auth/index.js';
import { ScreenManager } from './screen-manager.js';
import { GridRenderer } from './grid-renderer.js';
import { QuestionRenderer } from './question-renderer.js';
import { ReviewListRenderer } from './review-list-renderer.js';
import { ResultRenderer } from './result-renderer.js';
import { ExamHistoryRenderer } from './exam-history-renderer.js';
import { ModalManager } from '../../ui/modal-manager.js';
import { Toast } from '../../ui/toast.js';
import { showLoading, hideLoading } from '../../ui/loading.js';
import { queueTypeset } from '../../ui/mathjax-renderer.js';
import { handleError } from '../../utils/errors.js';
import { listSelectableLeaves, isTopicParent } from '../../core/topic-tree.js';
import * as checkExamApi from '../../services/exam/check-exam-api.js';
import * as practiceMixedApi from '../../services/quiz/practice-mixed-api.js';

/**
 * Main quiz application controller — orchestrates UI and business logic.
 */
export class QuizController {
    constructor() {
        this.practiceMixedSetId = null;
        /** @type {WrongHistoryService|null} */
        this.wrongHistoryService = null;
        this.gridRenderer = null;
        this.questionRenderer = null;
        this.reviewListRenderer = null;
        this.resultRenderer = new ResultRenderer();
        this.examHistoryRenderer = null;

        /** @type {HTMLElement|null} */
        this.btnExitTop = null;
        this.btnPrev = null;
        this.btnNext = null;
        this.btnSubmitExam = null;
        this.timerBox = null;
        this.timeLeftDisplay = null;
        this.quizMainTitle = null;
        /** @type {object[]} */
        this.openCheckSessions = [];
        this.selectedCheckBranch = null;
        this.selectedCheckSession = null;
        this._closesAtTimer = null;
    }

    /** Initialize quiz application */
    async init() {
        const currentUser = await auth.requireAuthAsync();
        if (!currentUser) return;

        this._cacheDomRefs();
        const userDisplay = $('userDisplayName');
        if (userDisplay) userDisplay.textContent = currentUser.fullName || currentUser.militaryId || '';
        this._bindEvents();

        showLoading('Đang tải dữ liệu...');

        try {
            this.wrongHistoryService = await createWrongHistoryService(currentUser);
            const historyState = this.wrongHistoryService.getState();

            store.setState({
                currentUser,
                wrongHistory: historyState.wrongHistory,
                correctHistory: historyState.correctHistory
            });

            const originalData = await this._loadQuizData();
            store.setState({ originalData });

            this._setupHomeScreen(originalData);
            await this._refreshCheckAvailability();
            this._bindQuizDataRefresh();
            this.showScreen('screenHome');
        } catch (err) {
            handleError(err, { context: 'QuizController.init', fallbackKey: 'QUIZ_LOAD' });
        } finally {
            hideLoading();
        }
    }

    /** @returns {Promise<object>} */
    async _loadQuizData() {
        const originalData = await quizRepo.loadQuizData();
        repairEssayQuestions(originalData);
        quizRepo.migrateHistoryHashes(originalData);
        return originalData;
    }

    /** Reload quiz bank when tab becomes visible (admin may have updated). */
    _bindQuizDataRefresh() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._refreshQuizDataQuietly();
            }
        });
    }

    async _refreshQuizDataQuietly() {
        try {
            const originalData = await this._loadQuizData();
            store.setState({ originalData });
            this._setupHomeScreen(originalData);
        } catch (err) {
            if (err.status === 401 || err.status === 403) return;
            console.warn('[QuizController] refresh failed:', err.message);
        }
    }

    _cacheDomRefs() {
        ScreenManager.init([
            'screenHome',
            'screenSetup',
            'screenQuiz',
            'screenResult',
            'screenTopicReview',
            'screenSetupWrong',
            'screenHistory'
        ]);

        this.btnExitTop = $('btnExitTop');
        this.btnPrev = $('btnPrev');
        this.btnNext = $('btnNext');
        this.btnSubmitExam = $('btnSubmitExam');
        this.timerBox = $('timerBox');
        this.timeLeftDisplay = $('timeLeftDisplay');
        this.quizMainTitle = $('quizMainTitle');

        this.gridRenderer = new GridRenderer($('gridQ'));
        this.questionRenderer = new QuestionRenderer($('qBox'));
        this.reviewListRenderer = new ReviewListRenderer($('reviewListContainer'));
        this.examHistoryRenderer = new ExamHistoryRenderer($('examHistoryList'));

        this._wireQuestionRenderer();
    }

    _wireQuestionRenderer() {
        this.questionRenderer.onTextInput = (index, value) => {
            const state = store.getState();
            const answers = { ...state.answers };
            if (!answers[index]) answers[index] = emptyAnswerState();
            answers[index].textValue = value;
            answers[index].selected = value.trim().length > 0 ? [-1] : [];
            store.setState({ answers });
            this._updateGrid();
        };

        this.questionRenderer.onToggleDoubt = index => {
            const state = store.getState();
            const answers = { ...state.answers };
            if (!answers[index]) answers[index] = emptyAnswerState();
            answers[index].doubtful = !answers[index].doubtful;
            store.setState({ answers });
            this.renderQuestion();
        };

        this.questionRenderer.onOptionClick = (ansIdx, isDoubt) => this._handleOptClick(ansIdx, isDoubt);
    }

    /**
     * @param {object} originalData
     */
    _setupHomeScreen(originalData) {
        const totalQ = countAllQuestions(originalData);
        $('homeTitle').textContent = originalData.title || APP_CONFIG.APP_NAME;

        const examQCount = $('examQCount');
        if (examQCount) {
            examQCount.value = totalQ;
            examQCount.max = totalQ;
        }
        const label = $('examQCountLabel');
        if (label) label.textContent = `Số lượng câu hỏi (Tối đa ${totalQ}):`;

        if (totalQ === 0) {
            Toast.info('Chưa có câu hỏi. Vào Quản trị để import dữ liệu hoặc đồng bộ Online.');
        }

        if (listSelectableLeaves(originalData).length > 1) {
            setVisible($('btnModeTopicReview'), true);
        }
        this._updateWrongButtonVisibility();
    }

    /**
     * @param {string} screenId
     */
    showScreen(screenId) {
        ScreenManager.show(screenId, { exitBtn: this.btnExitTop });
        if (screenId === 'screenHome') this._updateWrongButtonVisibility();
    }

    _updateWrongButtonVisibility() {
        const btn = $('btnModeReviewWrong');
        if (!btn) return;
        btn.style.display = 'flex';
        const count = this.wrongHistoryService?.getWrongCount() || 0;
        const h3 = btn.querySelector('h3');
        if (h3) {
            h3.textContent =
                count > 0 ? `Ôn tập các câu sai (${count})` : 'Ôn tập các câu sai';
        }
    }

    /** Reset quiz session and re-render */
    resetGame() {
        store.setState({ currentIndex: 0, answers: {} });
        this._buildGrid();
        this.renderQuestion();
    }

    _buildGrid() {
        const { totalCount, answers, currentIndex } = store.getState();
        this.gridRenderer.build(totalCount, idx => {
            store.setState({ currentIndex: idx });
            this.renderQuestion();
        });
        this._updateGrid(currentIndex, answers);
    }

    _updateGrid(currentIndex, answers) {
        const state = store.getState();
        this.gridRenderer.update(currentIndex ?? state.currentIndex, answers ?? state.answers, {
            progressText: $('progressText'),
            percentText: $('percentText')
        });
        this._updateSubmitButton();
    }

    /** Làm mờ nút nộp cho đến khi trả lời hết câu. */
    _updateSubmitButton() {
        const btn = this.btnSubmitExam;
        if (!btn || btn.style.display === 'none') return;

        const state = store.getState();
        const total = state.totalCount || state.quizData?.questions?.length || 0;
        if (!total) {
            btn.disabled = true;
            return;
        }

        let done = 0;
        for (let i = 0; i < total; i++) {
            if (hasAnswer(state.answers[i])) done++;
        }
        const ready = done === total;
        btn.disabled = !ready;
        btn.title = ready
            ? ''
            : `Còn ${total - done}/${total} câu chưa trả lời — làm hết để nộp`;
    }

    /** Render current question */
    renderQuestion() {
        const state = store.getState();
        const { quizData, currentIndex, answers, mode, totalCount } = state;
        const q = quizData.questions[currentIndex];
        if (!q) return;

        this.questionRenderer.render({
            question: q,
            index: currentIndex,
            totalCount,
            answerState: answers[currentIndex],
            mode
        });

        if (this.btnPrev) this.btnPrev.disabled = currentIndex === 0;
        if (this.btnNext) this.btnNext.disabled = currentIndex === totalCount - 1;

        this._updateGrid();
        queueTypeset($('qBox'));
    }

    /**
     * @param {number} ansIdx
     * @param {boolean} isDoubt
     */
    _handleOptClick(ansIdx, isDoubt) {
        const state = store.getState();
        const { currentIndex, mode, quizData, answers: prevAnswers } = state;
        const answers = { ...prevAnswers };
        if (!answers[currentIndex]) answers[currentIndex] = emptyAnswerState();
        if (mode === QUIZ_MODES.REVIEW && answers[currentIndex].isLocked) return;

        const q = quizData.questions[currentIndex];
        const sel = answers[currentIndex].selected;

        if (isDoubt) {
            if (isMultiSelectType(q)) {
                if (sel.indexOf(ansIdx) === -1) sel.push(ansIdx);
            } else {
                answers[currentIndex].selected = [ansIdx];
            }
            answers[currentIndex].doubtful = true;
        } else {
            if (isMultiSelectType(q)) {
                const p = sel.indexOf(ansIdx);
                if (p > -1) sel.splice(p, 1);
                else sel.push(ansIdx);
            } else {
                answers[currentIndex].selected = [ansIdx];
            }
            answers[currentIndex].doubtful = false;
        }

        store.setState({ answers });
        this.renderQuestion();
        this._recordPracticeMixedProgress(currentIndex);
    }

    /** Submit exam/review and show results */
    submitExam() {
        this._clearClosesAtWatcher();
        quizTimer.destroy();
        const state = store.getState();
        const answers = { ...state.answers };
        let scoreCount = 0;

        state.quizData.questions.forEach((q, i) => {
            let st = answers[i];
            const grade = gradeAnswer(q, st);

            if (grade.answered) {
                if (!st) st = answers[i] = emptyAnswerState();
                st.isCorrect = grade.isCorrect;
                st.isLocked = true;
                if (grade.isCorrect) scoreCount++;
                this.wrongHistoryService.recordAnswer(
                    q,
                    grade.isCorrect && !st.doubtful,
                    state.mode,
                    state.reviewSubMode
                );
            } else {
                answers[i] = {
                    selected: [],
                    textValue: '',
                    doubtful: false,
                    isLocked: true,
                    isCorrect: false
                };
                this.wrongHistoryService.recordAnswer(q, false, state.mode, state.reviewSubMode);
            }
        });

        const historyState = this.wrongHistoryService.getState();
        store.setState({
            answers,
            scoreCount,
            timeEndStr: formatDateTime(new Date()),
            wrongHistory: historyState.wrongHistory,
            correctHistory: historyState.correctHistory
        });

        this._updateWrongButtonVisibility();
        this._showResultScreen();

        if (state.mode === QUIZ_MODES.EXAM) {
            this._saveExamHistory();
        }
        if (state.mode === QUIZ_MODES.CHECK) {
            this._saveCheckResult();
        }
        if (
            state.mode === QUIZ_MODES.REVIEW &&
            state.reviewSubMode === REVIEW_SUB_MODES.GENERAL &&
            this.practiceMixedSetId
        ) {
            state.quizData.questions.forEach((q, i) => {
                if (q?.dbId && hasAnswer(answers[i])) {
                    practiceMixedApi.recordProgress(this.practiceMixedSetId, q.dbId).catch(() => {});
                }
            });
        }
    }

    /** Manual submit — require every question answered (timer auto-submit may leave blanks). */
    _promptSubmitExam() {
        const state = store.getState();
        const { questions } = state.quizData;
        const unanswered = QuizEngine.getUnansweredIndices(questions, state.answers, hasAnswer);

        if (unanswered.length > 0) {
            const nums = unanswered.map(i => i + 1).join(', ');
            Toast.warning(
                `Còn ${unanswered.length} câu chưa trả lời (câu ${nums}). Vui lòng làm hết trước khi nộp bài.`
            );
            store.setState({ currentIndex: unanswered[0] });
            this.renderQuestion();
            return;
        }

        const msgEl = $('submitConfirmMessage');
        if (msgEl) {
            const label = state.mode === QUIZ_MODES.EXAM ? 'nộp bài' : 'nộp đáp án';
            msgEl.textContent = `Bạn đã trả lời đủ ${questions.length} câu. Xác nhận ${label}?`;
        }
        ModalManager.open('modalConfirmSubmit');
    }

    _showResultScreen() {
        const state = store.getState();
        const timerState = quizTimer.getState();
        const { scoreCount, totalCount, quizData, timeTotalStr, timeStartStr, timeEndStr } = state;
        const { percent, scoreOutOf10 } = QuizEngine.summarizeScore(scoreCount, totalCount);

        this.showScreen('screenResult');
        this.resultRenderer.renderSummary({
            title: quizData.title,
            timeTotalStr,
            timeStartStr,
            timeEndStr,
            percent,
            scoreOutOf10,
            elapsedSec: timerState.elapsed
        });
        this._renderReviewList();
    }

    async _saveExamHistory() {
        const state = store.getState();
        const timerState = quizTimer.getState();
        const { scoreCount, totalCount, quizData, timeTotalStr, timeStartStr, timeEndStr } = state;
        const { scoreNumeric } = QuizEngine.summarizeScore(scoreCount, totalCount);
        const counts = QuizEngine.countByStatus(quizData.questions, state.answers, hasAnswer);

        try {
            await quizRepo.saveExamHistory(state.currentUser, {
                mode: QUIZ_MODES.EXAM,
                score: scoreNumeric,
                total: totalCount,
                durationSec: timerState.elapsed,
                detail: {
                    title: quizData.title,
                    timeStart: timeStartStr,
                    timeEnd: timeEndStr,
                    timeLimit: timeTotalStr,
                    correct: counts.correct,
                    wrong: counts.wrong,
                    unanswered: counts.unanswered
                }
            });
        } catch (err) {
            console.warn('[QuizController] exam history save failed:', err.message);
        }
    }

    async _saveCheckResult() {
        const state = store.getState();
        const sessionId = state.checkSessionId;
        if (!sessionId) return;

        const timerState = quizTimer.getState();
        const { scoreCount, totalCount, quizData, timeTotalStr, timeStartStr, timeEndStr } = state;
        const { scoreNumeric } = QuizEngine.summarizeScore(scoreCount, totalCount);
        const counts = QuizEngine.countByStatus(quizData.questions, state.answers, hasAnswer);

        try {
            await checkExamApi.submitSession(sessionId, {
                score: scoreNumeric,
                total: totalCount,
                durationSec: timerState.elapsed,
                detail: {
                    title: quizData.title,
                    type: state.checkSessionType,
                    timeStart: timeStartStr,
                    timeEnd: timeEndStr,
                    timeLimit: timeTotalStr,
                    correct: counts.correct,
                    wrong: counts.wrong,
                    unanswered: counts.unanswered
                }
            });
        } catch (err) {
            console.warn('[QuizController] check submit failed:', err.message);
            Toast.error(err.message || 'Lưu kết quả kiểm tra thất bại.');
        }
    }

    async _refreshCheckAvailability() {
        try {
            this.openCheckSessions = await checkExamApi.loadOpenSessions();
            setVisible($('btnModeCheck'), this.openCheckSessions.length > 0);
        } catch {
            this.openCheckSessions = [];
            setVisible($('btnModeCheck'), false);
        }
    }

    _clearClosesAtWatcher() {
        if (this._closesAtTimer) {
            clearInterval(this._closesAtTimer);
            this._closesAtTimer = null;
        }
    }

    _startClosesAtWatcher(closesAt) {
        this._clearClosesAtWatcher();
        const end = new Date(closesAt).getTime();
        this._closesAtTimer = setInterval(() => {
            if (Date.now() >= end) {
                this._clearClosesAtWatcher();
                Toast.warning('Đợt kiểm tra đã kết thúc! Hệ thống tự động nộp bài.');
                this.submitExam();
            }
        }, 1000);
    }

    _openCheckScreen() {
        this.selectedCheckBranch = null;
        this.selectedCheckSession = null;
        $('checkSessionList').style.display = 'none';
        $('checkSessionDetail').style.display = 'none';
        $('checkBranchButtons').innerHTML = '';

        const hasTopic = this.openCheckSessions.some(s => s.type === 'topic');
        const hasMixed = this.openCheckSessions.some(s => s.type === 'mixed');

        if (!hasTopic && !hasMixed) {
            $('checkScreenHint').textContent = 'Không có đợt kiểm tra nào đang mở.';
            this.showScreen('screenCheck');
            return;
        }

        $('checkScreenHint').textContent = 'Chọn loại kiểm tra';
        const container = $('checkBranchButtons');
        if (hasTopic) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-large btn-blue';
            btn.textContent = 'Theo lĩnh vực';
            btn.onclick = () => this._showCheckSessions('topic');
            container.appendChild(btn);
        }
        if (hasMixed) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-large btn-orange';
            btn.textContent = 'Trộn tổng hợp';
            btn.onclick = () => this._showCheckSessions('mixed');
            container.appendChild(btn);
        }
        this.showScreen('screenCheck');
    }

    _showCheckSessions(branch) {
        this.selectedCheckBranch = branch;
        const sessions = this.openCheckSessions.filter(s => s.type === branch);
        $('checkBranchButtons').style.display = 'none';
        $('checkScreenHint').textContent =
            branch === 'mixed' ? 'Trộn tổng hợp' : 'Theo lĩnh vực';

        const listEl = $('checkSessionList');
        listEl.style.display = 'block';
        listEl.innerHTML = '';

        if (branch === 'mixed' && sessions.length === 1) {
            this._selectCheckSession(sessions[0]);
            return;
        }

        sessions.forEach(session => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-toolbar btn-blue';
            btn.style.margin = '6px 0';
            btn.style.width = '100%';
            btn.textContent =
                session.type === 'mixed'
                    ? 'Trộn tổng hợp'
                    : session.topicTitle || `Lĩnh vực #${session.topicId}`;
            btn.onclick = () => this._selectCheckSession(session);
            listEl.appendChild(btn);
        });
    }

  async _selectCheckSession(session) {
        this.selectedCheckSession = session;
        $('checkSessionList').style.display = 'none';
        $('checkSessionDetail').style.display = 'block';

        const title =
            session.type === 'mixed'
                ? 'Kiểm tra — Trộn tổng hợp'
                : `Kiểm tra — ${session.topicTitle || 'Lĩnh vực'}`;
        $('checkSessionTitle').textContent = title;
        $('checkSessionMeta').textContent =
            `${session.questionsPerSet} câu · ${session.durationMinutes} phút · Đóng: ${formatDateTime(new Date(session.closesAt))}`;

        const blockedEl = $('checkSessionBlocked');
        const startBtn = $('btnStartCheck');
        blockedEl.style.display = 'none';
        startBtn.disabled = true;

        try {
            const readiness = await checkExamApi.getReadiness(session.id);
            if (readiness.alreadyCompleted) {
                blockedEl.textContent = 'Bạn đã hoàn thành đợt kiểm tra này.';
                blockedEl.style.display = 'block';
                return;
            }
            if (!readiness.canStart) {
                blockedEl.textContent = readiness.reason || 'Không thể bắt đầu làm bài.';
                blockedEl.style.display = 'block';
                return;
            }
            startBtn.disabled = false;
            startBtn.onclick = () => this._startCheckExam(session.id);
        } catch (err) {
            blockedEl.textContent = err.message || 'Không kiểm tra được điều kiện làm bài.';
            blockedEl.style.display = 'block';
        }
    }

    async _startCheckExam(sessionId) {
        showLoading('Đang tải bộ đề...');
        try {
            const payload = await checkExamApi.startSession(sessionId);
            const questions = (payload.questions || []).map(q => {
                prepareQuestion(q);
                return q;
            });
            if (!questions.length) {
                return Toast.error('Bộ đề trống.');
            }

            store.setState({
                checkSessionId: sessionId,
                checkClosesAt: payload.closesAt,
                checkSessionType: payload.session?.type
            });

            this._startQuizSession({
                mode: QUIZ_MODES.CHECK,
                quizData: { title: payload.title, questions },
                titleSuffix: ' (Kiểm tra)',
                showTimer: true,
                timerMinutes: payload.durationMinutes
            });
            this._startClosesAtWatcher(payload.closesAt);
        } catch (err) {
            handleError(err, { context: 'QuizController._startCheckExam', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _showExamHistory() {
        showLoading('Đang tải lịch sử thi...');
        try {
            const records = await quizRepo.loadExamHistory();
            this.examHistoryRenderer.render(records);
            this.showScreen('screenHistory');
        } catch (err) {
            handleError(err, { context: 'QuizController._showExamHistory', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    _renderReviewList() {
        const state = store.getState();
        const counts = QuizEngine.countByStatus(state.quizData.questions, state.answers, hasAnswer);

        this.reviewListRenderer.updateFilterLabels(
            { wrong: counts.wrong, correct: counts.correct, unanswered: counts.unanswered },
            state.totalCount
        );
        this.reviewListRenderer.render({
            questions: state.quizData.questions,
            answers: state.answers,
            filterMode: state.filterMode,
            totalCount: state.totalCount
        });
    }

    _createTopicReviewCard(item, idx, title) {
        const card = document.createElement('div');
        card.className = 'topic-review-card';
        const qCount = (item.topic.questions || []).length;
        card.innerHTML =
            `<div class="topic-card-title">${escapeAttr(title)}</div>` +
            `<div class="topic-card-meta">${qCount} câu hỏi</div>` +
            `<div class="topic-card-actions"><button class="btn-card-action btn-card-start" type="button">Ôn tập</button></div>`;
        card.querySelector('button').addEventListener('click', () => this._startTopicReview(idx));
        return card;
    }

    _renderTopicReviewList() {
        const { originalData } = store.getState();
        const container = $('topicReviewList');
        if (!container) return;
        container.innerHTML = '';

        const leaves = listSelectableLeaves(originalData);
        const leafIndex = new Map(
            leaves.map((item, idx) => [`${item.ref.p}:${item.ref.c ?? ''}`, idx])
        );
        const hasGroups = (originalData.topics || []).some(isTopicParent);
        container.className = hasGroups ? 'topic-review-list' : 'topic-grid-container';

        (originalData.topics || []).forEach((topic, p) => {
            if (isTopicParent(topic)) {
                const group = document.createElement('div');
                group.className = 'topic-review-group';

                const groupTitle = document.createElement('div');
                groupTitle.className = 'topic-review-group-title';
                groupTitle.textContent = topic.title;
                group.appendChild(groupTitle);

                const grid = document.createElement('div');
                grid.className = 'topic-grid-container';
                topic.children.forEach((child, c) => {
                    const idx = leafIndex.get(`${p}:${c}`);
                    if (idx == null) return;
                    grid.appendChild(this._createTopicReviewCard(leaves[idx], idx, child.title));
                });
                group.appendChild(grid);
                container.appendChild(group);
            } else if ((topic.questions?.length || 0) > 0) {
                const idx = leafIndex.get(`${p}:`);
                if (idx != null) {
                    container.appendChild(
                        this._createTopicReviewCard(leaves[idx], idx, topic.title)
                    );
                }
            }
        });
    }

    /**
     * @param {number} idx
     */
    _startTopicReview(idx) {
        const { originalData } = store.getState();
        const set = QuizEngine.buildTopicReviewSet(originalData, idx);
        this._startQuizSession({
            mode: QUIZ_MODES.REVIEW,
            reviewSubMode: REVIEW_SUB_MODES.TOPIC,
            quizData: { title: set.title, questions: set.questions },
            titleSuffix: ' (Ôn tập)',
            showTimer: false
        });
    }

    async _openPracticeMixedScreen() {
        showLoading('Đang tải bộ ôn tập...');
        try {
            const sets = await practiceMixedApi.loadSets();
            const listEl = $('practiceMixedList');
            const hintEl = $('practiceMixedHint');
            listEl.innerHTML = '';
            if (!sets.length) {
                hintEl.textContent = 'Chưa có bộ ôn tập. Admin cần cấu hình số câu/bộ và số bộ, rồi tái tạo.';
                this.showScreen('screenPracticeMixed');
                return;
            }
            hintEl.textContent = 'Chọn một bộ để ôn. Thanh tiến độ đếm câu đã trả lời (đúng hoặc sai).';
            sets.forEach(set => {
                const pct = set.total ? Math.round((set.answered / set.total) * 100) : 0;
                const card = document.createElement('div');
                card.className = 'topic-review-card';
                card.innerHTML =
                    `<div class="topic-card-title">Bộ ${set.setIndex}</div>` +
                    `<div class="topic-card-meta">${set.answered}/${set.total} câu đã làm</div>` +
                    `<div class="practice-set-progress" aria-hidden="true"><div class="practice-set-progress-bar" style="width:${pct}%"></div></div>` +
                    `<div class="topic-card-actions"><button class="btn-card-action btn-card-start" type="button">Ôn tập</button></div>`;
                card.querySelector('.btn-card-start').onclick = () => this._startPracticeMixedSet(set.id);
                listEl.appendChild(card);
            });
            this.showScreen('screenPracticeMixed');
        } catch (err) {
            handleError(err, { context: 'QuizController._openPracticeMixedScreen', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _startPracticeMixedSet(setId) {
        showLoading('Đang tải bộ đề...');
        try {
            const payload = await practiceMixedApi.loadSet(setId);
            const questions = (payload.questions || []).map(q => {
                prepareQuestion(q);
                return q;
            });
            if (!questions.length) {
                return Toast.error('Bộ ôn tập trống.');
            }
            this.practiceMixedSetId = setId;
            this._startQuizSession({
                mode: QUIZ_MODES.REVIEW,
                reviewSubMode: REVIEW_SUB_MODES.GENERAL,
                quizData: { title: payload.title, questions },
                titleSuffix: ' (Ôn tập)',
                showTimer: false
            });
        } catch (err) {
            handleError(err, { context: 'QuizController._startPracticeMixedSet', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    _recordPracticeMixedProgress(questionIndex) {
        const setId = this.practiceMixedSetId;
        if (!setId) return;
        const state = store.getState();
        if (state.mode !== QUIZ_MODES.REVIEW || state.reviewSubMode !== REVIEW_SUB_MODES.GENERAL) {
            return;
        }
        const q = state.quizData?.questions?.[questionIndex];
        if (!q?.dbId || !hasAnswer(state.answers[questionIndex])) return;
        practiceMixedApi.recordProgress(setId, q.dbId).catch(() => {});
    }

    /**
     * @param {Object} options
     */
    _startQuizSession({ mode, reviewSubMode, quizData, titleSuffix = '', showTimer = false, timerMinutes }) {
        quizTimer.destroy();
        if (reviewSubMode !== REVIEW_SUB_MODES.GENERAL) {
            this.practiceMixedSetId = null;
        }
        const totalCount = quizData.questions.length;
        const startTime = formatDateTime(new Date());

        store.setState({
            mode,
            reviewSubMode,
            quizData,
            totalCount,
            currentIndex: 0,
            answers: {},
            timeTotalStr: showTimer ? `${timerMinutes} phút` : 'Không giới hạn',
            timeStartStr: startTime,
            timeEndStr: ''
        });

        this.quizMainTitle.textContent = quizData.title + titleSuffix;

        const timerTitle = this.timerBox?.querySelector('.sidebar-box-title-text');
        if (timerTitle) {
            timerTitle.textContent = showTimer ? 'Thời gian còn lại' : 'Thời gian làm bài';
        }
        setVisible(this.timerBox, true, 'block');
        setVisible(this.btnSubmitExam, true);
        if (this.btnSubmitExam) {
            const isExam = mode === QUIZ_MODES.EXAM || mode === QUIZ_MODES.CHECK;
            this.btnSubmitExam.textContent = isExam ? 'Nộp bài' : 'Nộp đáp án';
            this.btnSubmitExam.classList.toggle('btn-submit-review', !isExam);
            this.btnSubmitExam.disabled = true;
            this.btnSubmitExam.title = 'Làm hết các câu để nộp';
        }

        const updateTimerUI = ({ text, isDanger }) => {
            if (this.timeLeftDisplay) {
                this.timeLeftDisplay.textContent = text;
                this.timeLeftDisplay.classList.toggle('danger', !!isDanger);
            }
        };

        if (showTimer && timerMinutes) {
            quizTimer.start(timerMinutes * 60, {
                onUpdateUI: updateTimerUI,
                onExpire: () => {
                    Toast.warning('Đã hết thời gian làm bài! Hệ thống tự động thu bài.');
                    this.submitExam();
                }
            });
        } else {
            quizTimer.startStopwatch({ onUpdateUI: updateTimerUI });
            if (this.timeLeftDisplay) {
                this.timeLeftDisplay.textContent = '00:00';
                this.timeLeftDisplay.classList.remove('danger');
            }
        }

        this.resetGame();
        this.showScreen('screenQuiz');
    }

    _setupWrongTopicSelection() {
        const { originalData } = store.getState();
        const topicContainer = $('wrongTopicSelection');
        const topicList = $('wrongTopicList');
        const leaves = listSelectableLeaves(originalData);

        if (leaves.length > 1) {
            topicContainer.style.display = 'block';
            let html =
                '<label style="display:flex;align-items:center;margin-bottom:6px;font-weight:bold;cursor:pointer;"><input type="checkbox" id="wrongTopicAll" checked style="margin-right:8px;"> Chọn tất cả</label><hr style="border:0;border-top:1px solid #ddd;margin:8px 0;">';
            leaves.forEach((item, i) => {
                html += `<label style="display:flex;align-items:center;margin-bottom:6px;cursor:pointer;"><input type="checkbox" class="wrong-topic-chk" value="${i}" checked style="margin-right:8px;"> ${escapeAttr(item.label)}</label>`;
            });
            topicList.innerHTML = html;

            $('wrongTopicAll').addEventListener('change', e => {
                document.querySelectorAll('.wrong-topic-chk').forEach(chk => {
                    chk.checked = e.target.checked;
                });
            });
            document.querySelectorAll('.wrong-topic-chk').forEach(chk => {
                chk.addEventListener('change', () => {
                    const allChecked = Array.from(document.querySelectorAll('.wrong-topic-chk')).every(
                        c => c.checked
                    );
                    $('wrongTopicAll').checked = allChecked;
                });
            });
        } else if (topicContainer) {
            topicContainer.style.display = 'none';
        }
    }

    _bindClick(id, handler) {
        const el = $(id);
        if (el) el.addEventListener('click', handler);
    }

    _bindEvents() {
        this._bindClick('btnModeReview', () => this._openPracticeMixedScreen());
        this._bindClick('btnBackHomeFromPracticeMixed', () => this.showScreen('screenHome'));
        this._bindClick('btnModeExam', () => this.showScreen('screenSetup'));
        this._bindClick('btnModeCheck', () => this._openCheckScreen());
        this._bindClick('btnBackHomeFromCheck', () => this.showScreen('screenHome'));
        this._bindClick('btnModeHistory', () => this._showExamHistory());
        this._bindClick('btnBackHomeFromHistory', () => this.showScreen('screenHome'));
        this._bindClick('btnBackHomeFromSetup', () => this.showScreen('screenHome'));

        this._bindClick('btnModeReviewWrong', () => {
            const count = this.wrongHistoryService?.getWrongCount() || 0;
            if (count === 0) {
                Toast.info(
                    'Chưa có câu sai nào. Hãy làm bài ôn tập hoặc thi thử trước — hệ thống sẽ tự ghi nhận các câu bạn trả lời sai.'
                );
                return;
            }
            this._setupWrongTopicSelection();
            this.showScreen('screenSetupWrong');
        });

        this._bindClick('btnBackHomeFromSetupWrong', () => this.showScreen('screenHome'));
        this._bindClick('btnModeTopicReview', () => {
            this._renderTopicReviewList();
            this.showScreen('screenTopicReview');
        });
        this._bindClick('btnBackHomeFromTopic', () => this.showScreen('screenHome'));

        this.btnExitTop?.addEventListener('click', () => ModalManager.open('modalConfirmExit'));
        ModalManager.bindConfirm('modalConfirmExit', 'btnConfirmExit', 'btnCancelExit', () => {
            quizTimer.destroy();
            const state = store.getState();
            const activeId = ScreenManager.getActiveId();
            if (
                state.mode === QUIZ_MODES.REVIEW &&
                state.reviewSubMode === REVIEW_SUB_MODES.TOPIC &&
                (activeId === 'screenQuiz' || activeId === 'screenResult')
            ) {
                this.showScreen('screenTopicReview');
            } else {
                this.showScreen('screenHome');
            }
        });

        this._bindClick('btnStartExam', () => {
            const count = parseInt($('examQCount').value, 10);
            const timeM = parseInt($('examTime').value, 10);
            if (isNaN(count) || count < 1) return Toast.warning('Số lượng không hợp lệ');
            if (isNaN(timeM) || timeM < 1) return Toast.warning('Thời gian không hợp lệ');

            const { originalData } = store.getState();
            const examSet = QuizEngine.buildExamSet(originalData, count);
            this._startQuizSession({
                mode: QUIZ_MODES.EXAM,
                reviewSubMode: null,
                quizData: examSet,
                titleSuffix: '',
                showTimer: true,
                timerMinutes: timeM
            });
        });

        this._bindClick('btnStartWrongReview', () => {
            const count = parseInt($('wrongQCount').value, 10);
            const minCount = parseInt($('wrongMinCount').value, 10);
            if (isNaN(count) || count < 1) return Toast.warning('Số lượng không hợp lệ');
            if (isNaN(minCount) || minCount < 1) return Toast.warning('Số lần sai không hợp lệ');

            const { originalData } = store.getState();
            let selectedTopics = [];
            const leaves = listSelectableLeaves(originalData);
            if (leaves.length > 1) {
                document.querySelectorAll('.wrong-topic-chk:checked').forEach(chk => {
                    selectedTopics.push(parseInt(chk.value, 10));
                });
                if (selectedTopics.length === 0) return Toast.warning('Vui lòng chọn ít nhất một nội dung ôn tập.');
            }

            const allQ = QuizEngine.getFlatQuestionsFromTopics(
                originalData,
                selectedTopics.length ? selectedTopics : null
            );
            const uniqueQs = QuizEngine.deduplicateByHash(allQ);
            const filtered = this.wrongHistoryService.filterWrongQuestions(uniqueQs, minCount);

            if (filtered.length === 0) {
                return Toast.warning(`Không có câu hỏi nào bị sai từ ${minCount} lần trở lên.`);
            }

            const questions = QuizEngine.buildWrongReviewSet(filtered, count);
            this._startQuizSession({
                mode: QUIZ_MODES.REVIEW,
                reviewSubMode: REVIEW_SUB_MODES.WRONG,
                quizData: { title: originalData.title, questions },
                titleSuffix: ' (Ôn câu sai)',
                showTimer: false
            });
        });

        if (this.btnPrev) {
            this.btnPrev.onclick = () => {
            const { currentIndex } = store.getState();
            if (currentIndex > 0) {
                store.setState({ currentIndex: currentIndex - 1 });
                this.renderQuestion();
            }
            };
        }

        if (this.btnNext) {
            this.btnNext.onclick = () => {
            const { currentIndex, totalCount } = store.getState();
            if (currentIndex < totalCount - 1) {
                store.setState({ currentIndex: currentIndex + 1 });
                this.renderQuestion();
            }
            };
        }

        if (this.btnSubmitExam) this.btnSubmitExam.onclick = () => this._promptSubmitExam();
        ModalManager.bindConfirm('modalConfirmSubmit', 'btnConfirmSubmit', 'btnCancelSubmit', () =>
            this.submitExam()
        );

        this._bindClick('tabKQ', () => this._switchResultTab('KQ'));
        this._bindClick('tabPT', () => this._switchResultTab('PT'));

        const filterMap = {
            fSai: FILTER_MODES.WRONG,
            fDung: FILTER_MODES.CORRECT,
            fTatCa: FILTER_MODES.ALL
        };
        Object.entries(filterMap).forEach(([id, mode]) => {
            const el = $(id);
            if (!el) return;
            el.onclick = e => {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                store.setState({ filterMode: mode });
                this._renderReviewList();
            };
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

        if (auth.isAdmin()) {
            setVisible($('btnAdminLink'), true);
            this._bindClick('btnAdminLink', () => {
                window.location.href = ROUTES.ADMIN;
            });
        }

        document.addEventListener('keydown', e => this._handleKeyboard(e));
    }

    /**
     * @param {string} tab
     */
    _switchResultTab(tab) {
        const isKQ = tab === 'KQ';
        $('tabKQ').classList.toggle('active', isKQ);
        $('tabPT').classList.toggle('active', !isKQ);
        $('contentKQ').classList.toggle('active', isKQ);
        $('contentPT').classList.toggle('active', !isKQ);
    }

    /**
     * Keyboard navigation: arrow keys for prev/next question.
     * @param {KeyboardEvent} e
     */
    _handleKeyboard(e) {
        const activeId = ScreenManager.getActiveId();
        if (activeId !== 'screenQuiz') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const { currentIndex, totalCount } = store.getState();
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            store.setState({ currentIndex: currentIndex - 1 });
            this.renderQuestion();
        } else if (e.key === 'ArrowRight' && currentIndex < totalCount - 1) {
            store.setState({ currentIndex: currentIndex + 1 });
            this.renderQuestion();
        }
    }
}
