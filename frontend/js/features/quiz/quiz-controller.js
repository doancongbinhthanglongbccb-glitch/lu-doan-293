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
    isTextInputType,
    countAllQuestions,
    prepareQuestion
} from '../../core/grading.js';
import { quizTimer } from '../../core/timer-service.js';
import { createWrongHistoryService } from '../../core/wrong-history-service.js';
import * as quizRepo from '../../storage/quiz-repository.js';
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
import * as topicReviewApi from '../../services/quiz/topic-review-api.js';
import * as wrongReviewApi from '../../services/quiz/wrong-review-api.js';
import * as gradeQuestionApi from '../../services/quiz/grade-question-api.js';

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
        this.historyTab = 'topic';
        this.practiceSetSource = 'mixed';
        this.currentTopicReview = null;
        this.topicReviewSetIndex = null;
        this._checkSubmitStarted = false;
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

            const originalData = await this._loadQuizOutline();
            store.setState({ originalData });

            this._setupHomeScreen(originalData);
            await this._refreshCheckAvailability();
            this._bindQuizDataRefresh();
            this._bindCheckLeaveGuard();
            this.showScreen('screenHome');
        } catch (err) {
            handleError(err, { context: 'QuizController.init', fallbackKey: 'QUIZ_LOAD' });
        } finally {
            hideLoading();
        }
    }

    /** @returns {Promise<object>} */
    async _loadQuizOutline() {
        return quizRepo.loadQuizOutline();
    }

    /** Reload outline when tab becomes visible (admin may have updated). */
    _bindQuizDataRefresh() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._refreshQuizDataQuietly();
            }
        });
    }

    async _refreshQuizDataQuietly() {
        try {
            const originalData = await this._loadQuizOutline();
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
            'screenQuiz',
            'screenResult',
            'screenTopicReview',
            'screenPracticeMixed',
            'screenCheck',
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
            this._recordPracticeMixedProgress(index);
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
        $('homeTitle').textContent = APP_CONFIG.APP_NAME;

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
        this.gridRenderer.build(totalCount, async idx => {
            try {
                await this._maybeGradeCurrentReview();
            } catch (err) {
                handleError(err, { context: 'QuizController.gridNavigate', fallbackKey: 'NETWORK' });
                return;
            }
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

        if (
            !isDoubt &&
            mode === QUIZ_MODES.REVIEW &&
            this._needsServerGrade(quizData.questions) &&
            !isMultiSelectType(q) &&
            !isTextInputType(q.type)
        ) {
            this._applyServerGrade(currentIndex)
                .then(() => this.renderQuestion())
                .catch(() => {});
        }
    }

    /**
     * Ôn tập (practice-mixed / topic-review) đã strip isCorrect — phải chấm ở server.
     * @param {object[]} questions
     */
    _needsServerGrade(questions) {
        return (questions || []).some(
            q => q?.dbId && !(q.answers || []).some(a => typeof a.isCorrect === 'boolean')
        );
    }

    /**
     * @param {number} index
     */
    async _applyServerGrade(index) {
        const state = store.getState();
        const q = state.quizData?.questions?.[index];
        const answers = { ...state.answers };
        const prev = answers[index] || emptyAnswerState();
        const st = {
            ...prev,
            selected: Array.isArray(prev.selected) ? [...prev.selected] : []
        };
        if (!q?.dbId || st.isLocked) return;
        if (!hasAnswer(st)) {
            st.isLocked = true;
            st.isCorrect = false;
            answers[index] = st;
            store.setState({ answers });
            return;
        }
        let result;
        try {
            result = await gradeQuestionApi.grade({
                questionId: q.dbId,
                selected: st.selected,
                textValue: st.textValue || ''
            });
        } catch (err) {
            if (err.status === 403 && /phiên Kiểm tra/i.test(err.message || '')) {
                return;
            }
            throw err;
        }
        st.isCorrect = !!result.correct;
        st.isLocked = true;
        st.explanation = result.explanation || null;
        st.correctIndexes = Array.isArray(result.explanation?.correctIndexes)
            ? result.explanation.correctIndexes
            : null;
        answers[index] = st;
        store.setState({ answers });
        if (this.wrongHistoryService) {
            this.wrongHistoryService.recordAnswer(
                q,
                st.isCorrect && !st.doubtful,
                state.mode,
                state.reviewSubMode
            );
            const historyState = this.wrongHistoryService.getState();
            store.setState({
                wrongHistory: historyState.wrongHistory,
                correctHistory: historyState.correctHistory
            });
        }
    }

    async _maybeGradeCurrentReview() {
        const state = store.getState();
        if (state.mode !== QUIZ_MODES.REVIEW) return;
        if (!this._needsServerGrade(state.quizData.questions)) return;
        const i = state.currentIndex;
        const st = state.answers[i];
        if (st?.isLocked || !hasAnswer(st)) return;
        await this._applyServerGrade(i);
        this.renderQuestion();
    }

    /** Submit exam/review and show results */
    submitExam() {
        this._clearClosesAtWatcher();
        quizTimer.destroy();
        if (store.getState().mode === QUIZ_MODES.CHECK) {
            this._checkSubmitStarted = true;
        }

        const finish = async ({ serverCorrect, hasAnswerKeys, grades } = {}) => {
            const state = store.getState();
            const answers = { ...state.answers };
            let scoreCount = 0;
            const needsServer =
                state.mode === QUIZ_MODES.REVIEW && this._needsServerGrade(state.quizData.questions);
            const skipLocalWrongHistory = state.mode === QUIZ_MODES.CHECK;

            if (state.mode === QUIZ_MODES.CHECK && !hasAnswerKeys) {
                const byId = new Map(
                    (Array.isArray(grades) ? grades : []).map(g => [Number(g.questionId), g])
                );
                state.quizData.questions.forEach((q, i) => {
                    const st = answers[i] || emptyAnswerState();
                    st.isLocked = true;
                    const g = byId.get(Number(q.dbId));
                    if (g) st.isCorrect = !!g.correct;
                    answers[i] = st;
                });
                scoreCount = Number.isFinite(serverCorrect) ? serverCorrect : 0;
            } else if (needsServer) {
                for (let i = 0; i < state.quizData.questions.length; i++) {
                    if (!answers[i]?.isLocked) {
                        await this._applyServerGrade(i);
                    }
                }
                const graded = store.getState().answers;
                Object.assign(answers, graded);
                state.quizData.questions.forEach((q, i) => {
                    const st = answers[i] || emptyAnswerState();
                    if (st.isCorrect) scoreCount++;
                    if (!skipLocalWrongHistory) {
                        this.wrongHistoryService.recordAnswer(
                            q,
                            !!st.isCorrect && !st.doubtful && hasAnswer(st),
                            state.mode,
                            state.reviewSubMode
                        );
                    }
                });
            } else {
                state.quizData.questions.forEach((q, i) => {
                    let st = answers[i];
                    const grade = gradeAnswer(q, st);

                    if (grade.answered) {
                        if (!st) st = answers[i] = emptyAnswerState();
                        st.isCorrect = grade.isCorrect;
                        st.isLocked = true;
                        if (grade.isCorrect) scoreCount++;
                        if (!skipLocalWrongHistory) {
                            this.wrongHistoryService.recordAnswer(
                                q,
                                grade.isCorrect && !st.doubtful,
                                state.mode,
                                state.reviewSubMode
                            );
                        }
                    } else {
                        answers[i] = {
                            selected: [],
                            textValue: '',
                            doubtful: false,
                            isLocked: true,
                            isCorrect: false
                        };
                        if (!skipLocalWrongHistory) {
                            this.wrongHistoryService.recordAnswer(q, false, state.mode, state.reviewSubMode);
                        }
                    }
                });
            }

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
        };

        const state = store.getState();
        if (state.mode === QUIZ_MODES.CHECK) {
            this._saveCheckResult()
                .then(payload => {
                    if (payload?.questions?.length) {
                        const questions = payload.questions.map(q => {
                            q.noShuffle = true;
                            return prepareQuestion(q);
                        });
                        store.setState({
                            quizData: { ...store.getState().quizData, questions }
                        });
                    }
                    finish({
                        serverCorrect: payload?.correct,
                        hasAnswerKeys: Array.isArray(payload?.questions) && payload.questions.length > 0,
                        grades: payload?.grades
                    }).catch(err => {
                        handleError(err, { context: 'QuizController.submitExam', fallbackKey: 'NETWORK' });
                    });
                })
                .catch(err => {
                    handleError(err, { context: 'QuizController.submitExam', fallbackKey: 'NETWORK' });
                });
            return;
        }

        finish().catch(err => {
            handleError(err, { context: 'QuizController.submitExam', fallbackKey: 'NETWORK' });
        });
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
        this._switchResultTab('KQ');
        this._renderReviewList();
    }

    async _saveCheckResult() {
        const sessionId = store.getState().checkSessionId;
        if (!sessionId) return;

        try {
            return await checkExamApi.submitSession(sessionId, this._buildCheckSubmitPayload());
        } catch (err) {
            this._checkSubmitStarted = false;
            console.warn('[QuizController] check submit failed:', err.message);
            Toast.error(err.message || 'Lưu kết quả kiểm tra thất bại.');
            throw err;
        }
    }

    _buildCheckSubmitPayload() {
        const state = store.getState();
        const timerState = quizTimer.getState();
        const { quizData, timeTotalStr, timeStartStr, timeEndStr } = state;
        return {
            topicId: state.checkTopicId,
            durationSec: timerState.elapsed,
            answers: (quizData.questions || []).map((q, i) => ({
                questionId: q.dbId,
                selected: state.answers[i]?.selected || [],
                textValue: state.answers[i]?.textValue || ''
            })),
            detail: {
                title: quizData.title,
                type: state.checkSessionType,
                timeStart: timeStartStr,
                timeEnd: timeEndStr,
                timeLimit: timeTotalStr
            }
        };
    }

    _isCheckQuizActive() {
        return store.getState().mode === QUIZ_MODES.CHECK && ScreenManager.getActiveId() === 'screenQuiz';
    }

    _bindCheckLeaveGuard() {
        window.addEventListener('beforeunload', e => {
            if (!this._isCheckQuizActive() || this._checkSubmitStarted) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    _openExitConfirm() {
        const state = store.getState();
        const activeId = ScreenManager.getActiveId();
        if (state.mode === QUIZ_MODES.CHECK && activeId === 'screenQuiz') {
            Toast.warning(
                'Hãy làm hết các câu rồi nộp bài. Chỉ khi hết giờ hệ thống mới thu bài tự động.'
            );
            return;
        }
        const msgEl = $('exitConfirmMessage');
        if (msgEl) {
            if (
                state.mode === QUIZ_MODES.REVIEW &&
                (state.reviewSubMode === REVIEW_SUB_MODES.GENERAL ||
                    state.reviewSubMode === REVIEW_SUB_MODES.TOPIC)
            ) {
                msgEl.textContent = 'Tiến độ ôn tập đã được lưu. Bạn muốn thoát?';
            } else {
                msgEl.textContent = 'Bạn muốn thoát? Phiên làm bài hiện tại sẽ không được lưu.';
            }
        }
        ModalManager.open('modalConfirmExit');
    }

    _onConfirmExit() {
        const state = store.getState();
        const activeId = ScreenManager.getActiveId();
        quizTimer.destroy();
        this._clearClosesAtWatcher();
        if (
            state.mode === QUIZ_MODES.REVIEW &&
            state.reviewSubMode === REVIEW_SUB_MODES.TOPIC &&
            (activeId === 'screenQuiz' || activeId === 'screenResult')
        ) {
            this.showScreen('screenTopicReview');
            return;
        }
        if (
            state.mode === QUIZ_MODES.REVIEW &&
            state.reviewSubMode === REVIEW_SUB_MODES.GENERAL &&
            (activeId === 'screenQuiz' || activeId === 'screenResult')
        ) {
            this._openPracticeMixedScreen();
            return;
        }
        this.showScreen('screenHome');
    }

    async _refreshCheckAvailability() {
        try {
            this.openCheckSessions = await checkExamApi.loadOpenSessions();
        } catch {
            this.openCheckSessions = [];
        }
        setVisible($('btnModeCheck'), true);
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

    async _openCheckScreen() {
        await this._refreshCheckAvailability();
        const sessions = this.openCheckSessions || [];
        if (!sessions.length) {
            Toast.info('Bài kiểm tra chưa mở');
            return;
        }

        const session = sessions.find(s => s.canStart) || sessions[0];
        if (!session.canStart) {
            Toast.info(session.startBlockedReason || 'Bài kiểm tra chưa mở');
            return;
        }

        this.selectedCheckSession = session;
        this.selectedCheckTopicId = null;
        this.selectedCheckSetId = null;
        this.checkSetLabel = '';
        this.checkNavStep = 'branches';
        this.showScreen('screenCheck');
        await this._showCheckBranches(session);
    }

    _onCheckBack() {
        const session = this.selectedCheckSession;
        if (!session || this.checkNavStep === 'branches') {
            this.showScreen('screenHome');
            return;
        }
        if (this.checkNavStep === 'confirm') {
            this._showCheckSets(session, this.selectedCheckTopicId, this.checkSetLabel);
            return;
        }
        if (this.checkNavStep === 'sets') {
            if (this.selectedCheckTopicId) this._showCheckTopics(session);
            else this._showCheckBranches(session);
            return;
        }
        this._showCheckBranches(session);
    }

    _resetCheckPanels() {
        const branchEl = $('checkBranchButtons');
        if (branchEl) {
            branchEl.innerHTML = '';
            branchEl.style.display = 'none';
        }
        $('checkSessionList').style.display = 'none';
        $('checkSessionList').innerHTML = '';
        $('checkSessionDetail').style.display = 'none';
    }

    async _showCheckBranches(session) {
        this.checkNavStep = 'branches';
        this._resetCheckPanels();
        showLoading('Đang tải...');
        try {
            const branches = await checkExamApi.loadBranches(session.id);
            $('checkScreenHint').textContent = 'Chọn phần thi';
            const container = $('checkBranchButtons');
            container.style.display = 'flex';

            if (branches.hasTopic) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-large btn-blue';
                btn.textContent = 'Theo lĩnh vực';
                btn.onclick = () => this._showCheckTopics(session);
                container.appendChild(btn);
            }
            if (branches.hasMixed) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-large btn-orange';
                btn.textContent = 'Tổng hợp';
                btn.onclick = () => this._showCheckSets(session, null, 'Tổng hợp');
                container.appendChild(btn);
            }
            if (!branches.hasTopic && !branches.hasMixed) {
                $('checkScreenHint').textContent = 'Đợt này chưa có bộ đề.';
            }
        } catch (err) {
            handleError(err, { context: 'QuizController._showCheckBranches', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _showCheckTopics(session) {
        this.checkNavStep = 'topics';
        this._resetCheckPanels();
        $('checkScreenHint').textContent = 'Chọn lĩnh vực';
        const listEl = $('checkSessionList');
        listEl.style.display = 'block';
        showLoading('Đang tải lĩnh vực...');
        try {
            const topics = await checkExamApi.loadSessionTopics(session.id);
            if (!topics.length) {
                listEl.innerHTML = '<p class="admin-hint">Chưa có lĩnh vực nào có bộ đề.</p>';
                return;
            }
            topics.forEach(topic => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-toolbar btn-blue';
                btn.style.cssText = 'margin:6px 0;width:100%';
                btn.textContent = topic.title;
                btn.onclick = () => this._showCheckSets(session, topic.id, topic.title);
                listEl.appendChild(btn);
            });
        } catch (err) {
            handleError(err, { context: 'QuizController._showCheckTopics', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _showCheckSets(session, topicId, label) {
        this.checkNavStep = 'sets';
        this.checkSetLabel = label;
        this._resetCheckPanels();
        this.selectedCheckTopicId = topicId;
        $('checkScreenHint').textContent = `Chọn bộ đề — ${label}`;
        const listEl = $('checkSessionList');
        listEl.style.display = 'block';
        showLoading('Đang tải bộ đề...');
        try {
            const sets = await checkExamApi.loadSets(session.id, topicId);
            if (!sets.length) {
                listEl.innerHTML = '<p class="admin-hint">Chưa có bộ đề.</p>';
                return;
            }
            sets.forEach(set => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-toolbar btn-blue';
                btn.style.cssText = 'margin:6px 0;width:100%';
                btn.textContent = `Bộ ${set.setIndex} (${set.questionCount} câu)`;
                btn.onclick = () => this._confirmCheckStart(session, topicId, set);
                listEl.appendChild(btn);
            });
        } catch (err) {
            handleError(err, { context: 'QuizController._showCheckSets', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _confirmCheckStart(session, topicId, set) {
        this.checkNavStep = 'confirm';
        this.selectedCheckSession = session;
        this.selectedCheckTopicId = topicId ?? null;
        this.selectedCheckSetId = set.id;
        $('checkBranchButtons').style.display = 'none';
        $('checkSessionList').style.display = 'none';
        $('checkSessionDetail').style.display = 'block';

        $('checkSessionTitle').textContent = 'Kiểm tra';
        $('checkScreenHint').textContent = '';
        $('checkSessionMeta').textContent =
            `Bộ ${set.setIndex} · ${set.questionCount} câu · ${session.durationMinutes} phút · Đóng: ${formatDateTime(new Date(session.closesAt))}`;

        const blockedEl = $('checkSessionBlocked');
        const startBtn = $('btnStartCheck');
        blockedEl.style.display = 'none';
        startBtn.disabled = true;

        try {
            const readiness = await checkExamApi.getReadiness(session.id, topicId);
            if (readiness.alreadyCompleted) {
                blockedEl.textContent = 'Bạn đã hoàn thành phần kiểm tra này.';
                blockedEl.style.display = 'block';
                return;
            }
            if (!readiness.canStart) {
                blockedEl.textContent = readiness.reason || 'Không thể bắt đầu làm bài.';
                blockedEl.style.display = 'block';
                return;
            }
            startBtn.disabled = false;
            startBtn.onclick = () => this._startCheckExam(session.id, topicId, set.id);
        } catch (err) {
            blockedEl.textContent = err.message || 'Không kiểm tra được điều kiện làm bài.';
            blockedEl.style.display = 'block';
        }
    }

    async _startCheckExam(sessionId, topicId, sessionSetId) {
        showLoading('Đang tải bộ đề...');
        try {
            const payload = await checkExamApi.startSession(sessionId, { topicId, sessionSetId });
            const questions = (payload.questions || []).map(q => {
                q.noShuffle = true;
                prepareQuestion(q);
                return q;
            });
            if (!questions.length) {
                return Toast.error('Bộ đề trống.');
            }

            store.setState({
                checkSessionId: sessionId,
                checkClosesAt: payload.closesAt,
                checkSessionType: payload.session?.type,
                checkTopicId: payload.topicId ?? topicId ?? null
            });
            this._checkSubmitStarted = false;

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
        showLoading('Đang tải lịch sử Kiểm tra...');
        try {
            const tab = this.historyTab || 'topic';
            const records = await checkExamApi.loadCheckHistory({ branch: tab });
            const emptyMessage =
                tab === 'mixed'
                    ? 'Chưa có bài Kiểm tra tổng hợp.'
                    : 'Chưa có bài Kiểm tra theo lĩnh vực.';
            this.examHistoryRenderer.render(records, emptyMessage);
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

    _createTopicReviewCard(item, idx, title, perSetCount, progress = null) {
        const card = document.createElement('div');
        card.className = 'topic-review-card';
        const qCount = item.topic.questionCount ?? (item.topic.questions || []).length;
        const perSet = Math.max(1, Number(perSetCount) || qCount || 1);
        const setCount = Math.max(1, Math.ceil(qCount / perSet));
        const answered = Math.max(0, Number(progress?.answered) || 0);
        const total = Math.max(0, Number(progress?.total) || 0);
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        card.innerHTML =
            `<div class="topic-card-title">${escapeAttr(title)}</div>` +
            `<div class="topic-card-meta">${qCount} câu hỏi · ${setCount} bộ</div>` +
            `<div class="topic-card-meta">${answered}/${total || qCount} câu đã làm</div>` +
            `<div class="practice-set-progress" aria-hidden="true"><div class="practice-set-progress-bar" style="width:${pct}%"></div></div>` +
            `<div class="topic-card-actions"><button class="btn-card-action btn-card-start" type="button">Ôn tập</button></div>`;
        card.querySelector('button').addEventListener('click', () => this._startTopicReview(idx));
        return card;
    }

    async _renderTopicReviewList() {
        const { originalData } = store.getState();
        const container = $('topicReviewList');
        if (!container) return;
        container.innerHTML = '';
        const perSetCount =
            originalData?.settings?.sharedQuestionCount ||
            originalData?.settings?.practiceMixedQuestionCount ||
            30;

        const leaves = listSelectableLeaves(originalData);
        const progressByTopic = new Map();
        await Promise.all(
            leaves.map(async item => {
                if (!item?.topic?.id) return;
                try {
                    const payload = await topicReviewApi.loadSets(item.topic.id);
                    const sets = payload.sets || [];
                    progressByTopic.set(item.topic.id, {
                        answered: sets.reduce((sum, s) => sum + (Number(s.answered) || 0), 0),
                        total: sets.reduce((sum, s) => sum + (Number(s.total) || 0), 0)
                    });
                } catch {
                    progressByTopic.set(item.topic.id, { answered: 0, total: 0 });
                }
            })
        );
        const leafIndex = new Map(
            leaves.map((item, idx) => [`${item.ref.p}:${item.ref.c ?? ''}`, idx])
        );
        const hasGroups = (originalData.topics || []).some(isTopicParent);
        container.className = (hasGroups ? 'topic-review-list' : 'topic-grid-container') + ' list-scroll';

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
                    const item = leaves[idx];
                    grid.appendChild(
                        this._createTopicReviewCard(
                            item,
                            idx,
                            child.title,
                            perSetCount,
                            progressByTopic.get(item.topic.id)
                        )
                    );
                });
                group.appendChild(grid);
                container.appendChild(group);
            } else if ((topic.questions?.length || 0) > 0) {
                const idx = leafIndex.get(`${p}:`);
                if (idx != null) {
                    const item = leaves[idx];
                    container.appendChild(
                        this._createTopicReviewCard(
                            item,
                            idx,
                            topic.title,
                            perSetCount,
                            progressByTopic.get(item.topic.id)
                        )
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
        const leaves = listSelectableLeaves(originalData);
        const item = leaves[idx];
        if (!item?.topic?.id) {
            Toast.error('Không tìm thấy nội dung ôn tập.');
            return;
        }
        this._openTopicReviewSets(item);
    }

    async _openTopicReviewSets(item) {
        showLoading('Đang tải bộ ôn tập...');
        try {
            const payload = await topicReviewApi.loadSets(item.topic.id);
            const sets = payload.sets || [];
            const titleEl = $('practiceMixedTitle');
            const subEl = $('practiceMixedSubtitle');
            const hintEl = $('practiceMixedHint');
            const listEl = $('practiceMixedList');
            this.practiceSetSource = 'topic';
            this.currentTopicReview = { topicId: item.topic.id, label: item.label };
            this.topicReviewSetIndex = null;

            if (titleEl) titleEl.textContent = 'Ôn tập từng phần';
            if (subEl) subEl.textContent = item.label || 'Chọn bộ đề';
            hintEl.textContent = 'Bộ đề chia cố định theo thứ tự câu (id tăng dần).';
            listEl.innerHTML = '';

            if (!sets.length) {
                listEl.innerHTML = '<p class="admin-hint">Nội dung này chưa có câu hỏi.</p>';
                this.showScreen('screenPracticeMixed');
                return;
            }

            sets.forEach(set => {
                const pct = set.total ? Math.round((set.answered / set.total) * 100) : 0;
                const card = document.createElement('div');
                card.className = 'topic-review-card';
                card.innerHTML =
                    `<div class="topic-card-title">Bộ ${set.setIndex}</div>` +
                    `<div class="topic-card-meta">${set.answered}/${set.total} câu đã làm</div>` +
                    `<div class="practice-set-progress" aria-hidden="true"><div class="practice-set-progress-bar" style="width:${pct}%"></div></div>` +
                    `<div class="topic-card-actions"><button class="btn-card-action btn-card-start" type="button">Ôn tập</button></div>`;
                card.querySelector('.btn-card-start').onclick = () =>
                    this._startTopicReviewSet(item.topic.id, set.setIndex);
                listEl.appendChild(card);
            });
            this.showScreen('screenPracticeMixed');
        } catch (err) {
            handleError(err, { context: 'QuizController._openTopicReviewSets', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _startTopicReviewSet(topicId, setIndex) {
        showLoading('Đang tải bộ đề...');
        try {
            const payload = await topicReviewApi.loadSet(topicId, setIndex);
            const questions = (payload.questions || []).map(q => {
                q.noShuffle = true;
                prepareQuestion(q);
                return q;
            });
            if (!questions.length) {
                return Toast.error('Bộ ôn tập trống.');
            }
            this.practiceSetSource = 'topic';
            this.topicReviewSetIndex = setIndex;
            this._startQuizSession({
                mode: QUIZ_MODES.REVIEW,
                reviewSubMode: REVIEW_SUB_MODES.TOPIC,
                quizData: { title: payload.title, questions },
                titleSuffix: ' (Ôn tập)',
                showTimer: false
            });
        } catch (err) {
            handleError(err, { context: 'QuizController._startTopicReviewSet', fallbackKey: 'NETWORK' });
        } finally {
            hideLoading();
        }
    }

    async _openPracticeMixedScreen() {
        showLoading('Đang tải bộ ôn tập...');
        try {
            const sets = await practiceMixedApi.loadSets();
            const listEl = $('practiceMixedList');
            const hintEl = $('practiceMixedHint');
            const titleEl = $('practiceMixedTitle');
            const subEl = $('practiceMixedSubtitle');
            this.practiceSetSource = 'mixed';
            this.currentTopicReview = null;
            this.topicReviewSetIndex = null;
            if (titleEl) titleEl.textContent = 'Ôn tập tổng hợp';
            if (subEl) subEl.textContent = 'Chọn bộ đề';
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
                q.noShuffle = true;
                prepareQuestion(q);
                return q;
            });
            if (!questions.length) {
                return Toast.error('Bộ ôn tập trống.');
            }
            this.practiceMixedSetId = setId;
            this.practiceSetSource = 'mixed';
            this.topicReviewSetIndex = null;
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
        const state = store.getState();
        if (state.mode !== QUIZ_MODES.REVIEW) {
            return;
        }
        const q = state.quizData?.questions?.[questionIndex];
        if (!q?.dbId || !hasAnswer(state.answers[questionIndex])) return;
        if (state.reviewSubMode === REVIEW_SUB_MODES.GENERAL) {
            const setId = this.practiceMixedSetId;
            if (!setId) return;
            practiceMixedApi.recordProgress(setId, q.dbId).catch(() => {});
            return;
        }
        if (state.reviewSubMode === REVIEW_SUB_MODES.TOPIC) {
            const topicId = this.currentTopicReview?.topicId;
            const setIndex = this.topicReviewSetIndex;
            if (!topicId || !setIndex) return;
            topicReviewApi.recordProgress(topicId, setIndex, q.dbId).catch(() => {});
        }
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
        const hideSubmit =
            mode === QUIZ_MODES.REVIEW &&
            (reviewSubMode === REVIEW_SUB_MODES.GENERAL || reviewSubMode === REVIEW_SUB_MODES.TOPIC);
        setVisible(this.btnSubmitExam, !hideSubmit);
        if (this.btnSubmitExam && !hideSubmit) {
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

        if (showTimer && Number(timerMinutes) > 0) {
            quizTimer.start(timerMinutes * 60, {
                onUpdateUI: updateTimerUI,
                onExpire: () => {
                    Toast.warning('Đã hết thời gian làm bài! Hệ thống tự động thu bài.');
                    this.submitExam();
                }
            });
        } else if (showTimer && mode === QUIZ_MODES.CHECK) {
            updateTimerUI({ text: '00:00', isDanger: true });
            queueMicrotask(() => {
                Toast.warning('Đã hết thời gian làm bài! Hệ thống tự động thu bài.');
                this.submitExam();
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
        if (mode === QUIZ_MODES.CHECK && this.btnExitTop) {
            this.btnExitTop.style.display = 'none';
        }
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
            leaves.forEach(item => {
                const tid = item.topic?.id;
                if (!tid) return;
                html += `<label style="display:flex;align-items:center;margin-bottom:6px;cursor:pointer;"><input type="checkbox" class="wrong-topic-chk" value="${tid}" checked style="margin-right:8px;"> ${escapeAttr(item.label)}</label>`;
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
        this._bindClick('btnBackHomeFromPracticeMixed', () => {
            if (this.practiceSetSource === 'topic') {
                this.showScreen('screenTopicReview');
                return;
            }
            this.showScreen('screenHome');
        });
        this._bindClick('btnModeCheck', () => this._openCheckScreen());
        this._bindClick('btnBackHomeFromCheck', () => this._onCheckBack());
        this._bindClick('btnModeHistory', () => this._showExamHistory());
        this._bindClick('btnBackHomeFromHistory', () => this.showScreen('screenHome'));
        document.querySelectorAll('[data-history-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                this.historyTab = tab.dataset.historyTab;
                document.querySelectorAll('[data-history-tab]').forEach(el => {
                    el.classList.toggle('active', el === tab);
                });
                this._showExamHistory();
            });
        });
        this._bindClick('btnModeReviewWrong', () => {
            const count = this.wrongHistoryService?.getWrongCount() || 0;
            if (count === 0) {
                Toast.info(
                    'Chưa có câu sai nào. Hãy làm bài ôn tập hoặc kiểm tra trước — hệ thống sẽ tự ghi nhận các câu bạn trả lời sai.'
                );
                return;
            }
            this._setupWrongTopicSelection();
            this.showScreen('screenSetupWrong');
        });

        this._bindClick('btnBackHomeFromSetupWrong', () => this.showScreen('screenHome'));
        this._bindClick('btnModeTopicReview', async () => {
            showLoading('Đang tải tiến độ ôn tập...');
            try {
                await this._renderTopicReviewList();
                this.showScreen('screenTopicReview');
            } finally {
                hideLoading();
            }
        });
        this._bindClick('btnBackHomeFromTopic', () => this.showScreen('screenHome'));

        this.btnExitTop?.addEventListener('click', () => this._openExitConfirm());
        ModalManager.bindConfirm('modalConfirmExit', 'btnConfirmExit', 'btnCancelExit', () =>
            this._onConfirmExit()
        );

        this._bindClick('btnStartWrongReview', async () => {
            const count = parseInt($('wrongQCount').value, 10);
            const minCount = parseInt($('wrongMinCount').value, 10);
            if (isNaN(count) || count < 1) return Toast.warning('Số lượng không hợp lệ');
            if (isNaN(minCount) || minCount < 1) return Toast.warning('Số lần sai không hợp lệ');

            const { originalData } = store.getState();
            const leaves = listSelectableLeaves(originalData);
            let topicIds = [];
            if (leaves.length > 1) {
                document.querySelectorAll('.wrong-topic-chk:checked').forEach(chk => {
                    const id = parseInt(chk.value, 10);
                    if (id > 0) topicIds.push(id);
                });
                if (topicIds.length === 0) return Toast.warning('Vui lòng chọn ít nhất một nội dung ôn tập.');
            }

            showLoading('Đang tải câu sai...');
            try {
                const payload = await wrongReviewApi.loadWrongReview({
                    topicIds,
                    minWrongCount: minCount,
                    count
                });
                const raw = payload.questions || [];
                if (!raw.length) {
                    return Toast.warning(`Không có câu hỏi nào bị sai từ ${minCount} lần trở lên.`);
                }
                const questions = raw.map(q => prepareQuestion(q));
                this._startQuizSession({
                    mode: QUIZ_MODES.REVIEW,
                    reviewSubMode: REVIEW_SUB_MODES.WRONG,
                    quizData: { title: originalData.title || payload.title, questions },
                    titleSuffix: ' (Ôn câu sai)',
                    showTimer: false
                });
            } catch (err) {
                handleError(err, { context: 'QuizController.wrongReview', fallbackKey: 'NETWORK' });
            } finally {
                hideLoading();
            }
        });

        if (this.btnPrev) {
            this.btnPrev.onclick = async () => {
            const { currentIndex } = store.getState();
            if (currentIndex > 0) {
                try {
                    await this._maybeGradeCurrentReview();
                } catch (err) {
                    handleError(err, { context: 'QuizController.btnPrev', fallbackKey: 'NETWORK' });
                    return;
                }
                store.setState({ currentIndex: store.getState().currentIndex - 1 });
                this.renderQuestion();
            }
            };
        }

        if (this.btnNext) {
            this.btnNext.onclick = async () => {
            const { currentIndex, totalCount } = store.getState();
            if (currentIndex < totalCount - 1) {
                try {
                    await this._maybeGradeCurrentReview();
                } catch (err) {
                    handleError(err, { context: 'QuizController.btnNext', fallbackKey: 'NETWORK' });
                    return;
                }
                store.setState({ currentIndex: store.getState().currentIndex + 1 });
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
        const tabKQ = $('tabKQ');
        const tabPT = $('tabPT');
        const contentKQ = $('contentKQ');
        const contentPT = $('contentPT');
        tabKQ?.classList.toggle('active', isKQ);
        tabPT?.classList.toggle('active', !isKQ);
        contentKQ?.classList.toggle('active', isKQ);
        contentPT?.classList.toggle('active', !isKQ);
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
