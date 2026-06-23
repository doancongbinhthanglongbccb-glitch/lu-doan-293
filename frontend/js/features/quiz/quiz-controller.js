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
    countAllQuestions
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

/**
 * Main quiz application controller — orchestrates UI and business logic.
 */
export class QuizController {
    constructor() {
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
    }

    /** Initialize quiz application */
    async init() {
        const currentUser = await auth.requireAuthAsync();
        if (!currentUser) return;

        showLoading('Đang tải dữ liệu...');

        try {
            this.wrongHistoryService = await createWrongHistoryService(currentUser);
            const historyState = this.wrongHistoryService.getState();

            store.setState({
                currentUser,
                wrongHistory: historyState.wrongHistory,
                correctHistory: historyState.correctHistory
            });

            this._cacheDomRefs();
            $('userDisplayName').textContent = currentUser.fullName || currentUser.militaryId || '';

            const originalData = await this._loadQuizData();
            store.setState({ originalData });

            this._setupHomeScreen(originalData);
            this._bindEvents();
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

        this.questionRenderer.onCheckReview = (q, index) => this._checkReviewAnswer(q, index);

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

        if (originalData.topics?.length > 1) {
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
     * @param {object} q
     * @param {number} index
     */
    _checkReviewAnswer(q, index) {
        const state = store.getState();
        const answers = { ...state.answers };
        if (!answers[index]) answers[index] = emptyAnswerState();
        if (answers[index].isLocked) return;

        const grade = gradeAnswer(q, answers[index]);
        if (!grade.answered) {
            Toast.warning(
                isTextInputType(q.type)
                    ? 'Vui lòng nhập câu trả lời trước khi nộp.'
                    : 'Vui lòng chọn đáp án trước khi nộp.'
            );
            return;
        }

        answers[index].isLocked = true;
        answers[index].isCorrect = grade.isCorrect;
        store.setState({ answers });

        this.wrongHistoryService.recordAnswer(
            q,
            grade.isCorrect && !answers[index].doubtful,
            state.mode,
            state.reviewSubMode
        );
        const historyState = this.wrongHistoryService.getState();
        store.setState({
            wrongHistory: historyState.wrongHistory,
            correctHistory: historyState.correctHistory
        });

        this.renderQuestion();
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
    }

    /** Submit exam and show results */
    submitExam() {
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
                if (grade.isCorrect) scoreCount++;
                this.wrongHistoryService.recordAnswer(
                    q,
                    grade.isCorrect && !st.doubtful,
                    state.mode,
                    state.reviewSubMode
                );
            } else {
                answers[i] = { selected: [], textValue: '', isCorrect: false };
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
            msgEl.textContent = `Bạn đã trả lời đủ ${questions.length} câu. Xác nhận nộp bài?`;
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

    _renderTopicReviewList() {
        const { originalData } = store.getState();
        const container = $('topicReviewList');
        container.innerHTML = '';
        originalData.topics.forEach((topic, idx) => {
            const card = document.createElement('div');
            card.className = 'topic-review-card';
            card.innerHTML =
                `<div class="topic-card-title">${escapeAttr(topic.title)}</div>` +
                `<div class="topic-card-meta">${topic.questions.length} câu hỏi</div>` +
                `<div class="topic-card-actions"><button class="btn-card-action btn-card-start" data-idx="${idx}">Ôn tập</button></div>`;
            card.querySelector('button').addEventListener('click', () => this._startTopicReview(idx));
            container.appendChild(card);
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

    _startGeneralReview() {
        const { originalData } = store.getState();
        const set = QuizEngine.buildGeneralReviewSet(originalData);
        this._startQuizSession({
            mode: QUIZ_MODES.REVIEW,
            reviewSubMode: REVIEW_SUB_MODES.GENERAL,
            quizData: set,
            titleSuffix: ' (Ôn tập)',
            showTimer: false
        });
    }

    /**
     * @param {Object} options
     */
    _startQuizSession({ mode, reviewSubMode, quizData, titleSuffix = '', showTimer = false, timerMinutes }) {
        quizTimer.destroy();
        const totalCount = quizData.questions.length;

        store.setState({
            mode,
            reviewSubMode,
            quizData,
            totalCount,
            currentIndex: 0,
            answers: {},
            timeTotalStr: showTimer ? `${timerMinutes} phút` : 'Không giới hạn',
            timeStartStr: showTimer ? formatDateTime(new Date()) : store.getState().timeStartStr
        });

        this.quizMainTitle.textContent = quizData.title + titleSuffix;
        setVisible(this.timerBox, showTimer, 'block');
        setVisible(this.btnSubmitExam, showTimer);

        if (showTimer && timerMinutes) {
            quizTimer.start(timerMinutes * 60, {
                onUpdateUI: ({ text, isDanger }) => {
                    if (this.timeLeftDisplay) {
                        this.timeLeftDisplay.textContent = text;
                        this.timeLeftDisplay.classList.toggle('danger', isDanger);
                    }
                },
                onExpire: () => {
                    Toast.warning('Đã hết thời gian làm bài! Hệ thống tự động thu bài.');
                    this.submitExam();
                }
            });
        }

        this.resetGame();
        this.showScreen('screenQuiz');
    }

    _setupWrongTopicSelection() {
        const { originalData } = store.getState();
        const topicContainer = $('wrongTopicSelection');
        const topicList = $('wrongTopicList');

        if (originalData.topics?.length > 1) {
            topicContainer.style.display = 'block';
            let html =
                '<label style="display:flex;align-items:center;margin-bottom:6px;font-weight:bold;cursor:pointer;"><input type="checkbox" id="wrongTopicAll" checked style="margin-right:8px;"> Chọn tất cả</label><hr style="border:0;border-top:1px solid #ddd;margin:8px 0;">';
            originalData.topics.forEach((t, i) => {
                html += `<label style="display:flex;align-items:center;margin-bottom:6px;cursor:pointer;"><input type="checkbox" class="wrong-topic-chk" value="${i}" checked style="margin-right:8px;"> ${t.title}</label>`;
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

    _bindEvents() {
        $('btnModeReview').addEventListener('click', () => this._startGeneralReview());
        $('btnModeExam').addEventListener('click', () => this.showScreen('screenSetup'));
        $('btnModeHistory').addEventListener('click', () => this._showExamHistory());
        $('btnBackHomeFromHistory').addEventListener('click', () => this.showScreen('screenHome'));
        $('btnBackHomeFromSetup').addEventListener('click', () => this.showScreen('screenHome'));

        $('btnModeReviewWrong').addEventListener('click', () => {
            if (this.wrongHistoryService.getWrongCount() === 0) {
                Toast.info(
                    'Chưa có câu sai nào. Hãy làm bài ôn tập hoặc thi thử trước — hệ thống sẽ tự ghi nhận các câu bạn trả lời sai.'
                );
                return;
            }
            this._setupWrongTopicSelection();
            this.showScreen('screenSetupWrong');
        });

        $('btnBackHomeFromSetupWrong').addEventListener('click', () => this.showScreen('screenHome'));
        $('btnModeTopicReview').addEventListener('click', () => {
            this._renderTopicReviewList();
            this.showScreen('screenTopicReview');
        });
        $('btnBackHomeFromTopic').addEventListener('click', () => this.showScreen('screenHome'));

        this.btnExitTop.addEventListener('click', () => ModalManager.open('modalConfirmExit'));
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

        $('btnStartExam').addEventListener('click', () => {
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

        $('btnStartWrongReview').addEventListener('click', () => {
            const count = parseInt($('wrongQCount').value, 10);
            const minCount = parseInt($('wrongMinCount').value, 10);
            if (isNaN(count) || count < 1) return Toast.warning('Số lượng không hợp lệ');
            if (isNaN(minCount) || minCount < 1) return Toast.warning('Số lần sai không hợp lệ');

            const { originalData } = store.getState();
            let selectedTopics = [];
            if (originalData.topics?.length > 1) {
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

        this.btnPrev.onclick = () => {
            const { currentIndex } = store.getState();
            if (currentIndex > 0) {
                store.setState({ currentIndex: currentIndex - 1 });
                this.renderQuestion();
            }
        };

        this.btnNext.onclick = () => {
            const { currentIndex, totalCount } = store.getState();
            if (currentIndex < totalCount - 1) {
                store.setState({ currentIndex: currentIndex + 1 });
                this.renderQuestion();
            }
        };

        this.btnSubmitExam.onclick = () => this._promptSubmitExam();
        ModalManager.bindConfirm('modalConfirmSubmit', 'btnConfirmSubmit', 'btnCancelSubmit', () =>
            this.submitExam()
        );

        $('tabKQ').onclick = () => this._switchResultTab('KQ');
        $('tabPT').onclick = () => this._switchResultTab('PT');

        const filterMap = {
            fSai: FILTER_MODES.WRONG,
            fDung: FILTER_MODES.CORRECT,
            fChuaLam: FILTER_MODES.UNANSWERED,
            fTatCa: FILTER_MODES.ALL
        };
        Object.entries(filterMap).forEach(([id, mode]) => {
            $(id).onclick = e => {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                store.setState({ filterMode: mode });
                this._renderReviewList();
            };
        });

        $('btnLogout').addEventListener('click', () => {
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
            $('btnAdminLink').addEventListener('click', () => {
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
