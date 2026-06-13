/**
 * Logic chính cho trang User (index.html)
 * Giữ đầy đủ chức năng: ôn tập, thi thử, ôn câu sai, review, grid, timer...
 */
const TSQCB_App = (function () {
    let originalData = null;
    let currentUser = null;
    let wrongHistory = {};
    let correctHistory = {};

    let qData = { title: '', questions: [] };
    let mode = ''; // 'review', 'exam', 'wrong'
    let reviewSubMode = ''; // 'topic', 'general', 'wrong'
    let curIdx = 0;
    let answered = {};
    let timer = null;
    let timeRem = 0;
    let timeTotalStr = '';
    let timeStartStr = '';
    let timeEndStr = '';
    let timeElapsedSec = 0;
    let scoreCount = 0;
    let totalCount = 0;
    let filterMode = 'all';

    // DOM refs
    let screenHome, screenSetup, screenQuiz, screenResult;
    let btnExitTop, quizMainTitle, qBox, timeLeftDisplay;
    let progressText, percentText, timerBox, btnSubmitExam;
    let gridQ, btnPrev, btnNext;

    const $ = TSQCB_Utils.$;

    function recordWrong(q, isCor) {
        if (!isCor) {
            wrongHistory[q.hash] = (wrongHistory[q.hash] || 0) + 1;
            correctHistory[q.hash] = 0;
        } else if (wrongHistory[q.hash]) {
            wrongHistory[q.hash]--;
            if (mode === 'review' && reviewSubMode === 'wrong') {
                correctHistory[q.hash] = (correctHistory[q.hash] || 0) + 1;
                if (correctHistory[q.hash] >= 3) {
                    delete wrongHistory[q.hash];
                    delete correctHistory[q.hash];
                }
            }
            if (wrongHistory[q.hash] !== undefined && wrongHistory[q.hash] <= 0) {
                delete wrongHistory[q.hash];
                delete correctHistory[q.hash];
            }
        }
        TSQCB_Storage.saveWrongHistory(currentUser, wrongHistory);
        TSQCB_Storage.saveCorrectHistory(currentUser, correctHistory);
        updateWrongButtonVisibility();
    }

    function updateWrongButtonVisibility() {
        const btn = $('btnModeReviewWrong');
        if (!btn) return;
        btn.style.display = 'flex';
        const count = Object.keys(wrongHistory).length;
        const h3 = btn.querySelector('h3');
        if (h3) {
            h3.textContent = count > 0
                ? 'Ôn tập các câu sai (' + count + ')'
                : 'Ôn tập các câu sai';
        }
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        $(id).classList.add('active');
        btnExitTop.style.display = (id === 'screenHome' || id === 'screenSetup' || id === 'screenSetupWrong') ? 'none' : 'flex';
        if (id === 'screenHome') updateWrongButtonVisibility();
    }

    function getFlatQuestionsFromTopics(topicIndexes) {
        let allQ = [];
        if (originalData.topics && originalData.topics.length > 1 && topicIndexes) {
            topicIndexes.forEach(idx => {
                allQ = allQ.concat(originalData.topics[idx].questions);
            });
        } else if (originalData.topics) {
            originalData.topics.forEach(t => { allQ = allQ.concat(t.questions); });
        }
        return allQ;
    }

    function updateTimerUI() {
        if (timeRem < 0) timeRem = 0;
        const m = Math.floor(timeRem / 60).toString().padStart(2, '0');
        const s = (timeRem % 60).toString().padStart(2, '0');
        timeLeftDisplay.textContent = m + ':' + s;
        if (timeRem <= 60 && timeRem > 0) timeLeftDisplay.classList.add('danger');
        else timeLeftDisplay.classList.remove('danger');
    }

    function resetGame() {
        curIdx = 0;
        answered = {};
        buildGrid();
        renderQ();
    }

    function buildGrid() {
        gridQ.innerHTML = '';
        for (let i = 0; i < totalCount; i++) {
            const div = document.createElement('div');
            div.className = 'grid-item';
            div.id = 'gridQ' + i;
            div.textContent = i + 1;
            div.onclick = () => { curIdx = i; renderQ(); };
            gridQ.appendChild(div);
        }
        updateGridAndStats();
    }

    function updateGridAndStats() {
        let done = 0;
        for (let i = 0; i < totalCount; i++) {
            const el = $('gridQ' + i);
            if (el) {
                el.className = 'grid-item';
                if (answered[i] && answered[i].doubtful) el.classList.add('doubt');
                else if (TSQCB_Utils.hasAnswer(answered[i])) {
                    el.classList.add('done');
                }
                if (i === curIdx) el.classList.add('current');
            }
            if (TSQCB_Utils.hasAnswer(answered[i])) done++;
        }
        progressText.textContent = done + '/' + totalCount;
        percentText.textContent = (totalCount > 0 ? Math.round((done / totalCount) * 100) : 0) + '%';
    }

    function renderQ() {
        const q = qData.questions[curIdx];
        const ansState = answered[curIdx];
        const typeText = TSQCB_Utils.getQuestionTypeLabel(q.type);

        let html = '<div class="q-header">' +
            '<div class="q-badge-wrap" style="align-items:center;">' +
            '<div style="font-weight:bold;font-size:15px;">Câu:</div>' +
            '<div class="q-badge-num">' + (curIdx + 1) + '/' + totalCount + '</div>' +
            '<div class="q-badge-type">' + typeText + '</div>' +
            '</div>' +
            '<div class="q-content">' + q.contentHtml + (q.isMul && q.type !== 'Multipleresponse' ? '<i>(Nhiều đáp án)</i>' : '') + '</div>' +
            '<div style="clear:both;"></div></div><div class="options-list">';

        if (q.type === 'Fillintheblank' || q.type === 'essayquestion') {
            const userVal = ansState && ansState.textValue ? ansState.textValue : '';
            const disabledStr = (mode === 'review' && ansState && ansState.isLocked) ? 'disabled' : '';
            if (q.type === 'essayquestion') {
                html += '<div><textarea class="opt-textarea" id="textAns' + curIdx + '" placeholder="Nhập câu trả lời..." ' + disabledStr + '>' + userVal + '</textarea></div>';
            } else {
                html += '<div><input type="text" class="opt-text" value="' + TSQCB_Utils.escapeAttr(userVal) + '" id="textAns' + curIdx + '" placeholder="Nhập câu trả lời..." ' + disabledStr + '></div>';
            }
            if (mode === 'review' && ansState && ansState.isLocked) {
                const corAns = q.answers.find(a => a.isCorrect);
                if (corAns) {
                    html += '<div class="answer-correct-box"><b>Đáp án đúng:</b><div class="formatted-answer">' +
                        TSQCB_Excel.formatAnswerForDisplay(corAns.html) +
                        '</div></div>';
                }
            }
        } else {
            q.answers.forEach((ans, idx) => {
                const isSel = ansState && ansState.selected.includes(idx);
                let c = 'opt-item' + (isSel ? ' selected' : '');
                if (mode === 'review' && ansState && ansState.isLocked) {
                    if (ans.isCorrect) c += ' correct selected';
                    else if (isSel) c += ' wrong selected';
                }
                const radioStyle = q.type === 'Multipleresponse' ? 'border-radius:4px;' : 'border-radius:50%;';
                const radioInnerStyle = q.type === 'Multipleresponse' ? 'border-radius:2px;' : 'border-radius:50%;';
                html += '<div class="' + c + '" data-idx="' + idx + '">' +
                    '<div class="opt-radio" style="' + radioStyle + '"><div class="opt-radio-inner" style="' + radioInnerStyle + '"></div></div>' +
                    '<div class="opt-letter">' + ans.letter + '.</div>' +
                    '<div class="q-content">' + ans.html + '</div></div>';
            });
        }
        html += '</div>';

        html += '<div style="margin-top:15px;display:flex;justify-content:space-between;align-items:center;">';
        if (mode === 'exam') {
            const isDoubt = ansState && ansState.doubtful;
            const btnColor = isDoubt ? 'var(--primary)' : '#ccc';
            const btnText = isDoubt ? 'Đã đánh dấu nghi ngờ' : 'Đánh dấu nghi ngờ';
            html += '<button id="btnToggleDoubt" style="padding:8px 15px;font-size:14px;border:1px solid ' + btnColor + ';border-radius:5px;background:' + (isDoubt ? 'var(--primary)' : 'transparent') + ';color:' + (isDoubt ? 'white' : '#666') + ';cursor:pointer;">&#9873; ' + btnText + '</button>';
        } else {
            html += '<div></div>';
        }
        if (mode === 'review' && (!ansState || !ansState.isLocked)) {
            html += '<button id="btnCheckReview" style="padding:10px 20px;font-size:16px;border:none;border-radius:5px;background:var(--blue-accent);color:white;cursor:pointer;">Nộp đáp án</button>';
        } else if (mode === 'review' && ansState && ansState.isLocked) {
            html += '<span style="font-size:14px;color:#666;font-weight:500;">' +
                (ansState.isCorrect ? '✔ Chính xác' : '✘ Chưa đúng') + '</span>';
        }
        html += '</div>';
        qBox.innerHTML = html;

        if (q.type === 'Fillintheblank' || q.type === 'essayquestion') {
            setTimeout(() => {
                const textEl = $('textAns' + curIdx);
                if (textEl) {
                    textEl.oninput = (e) => {
                        if (!answered[curIdx]) answered[curIdx] = TSQCB_Utils.emptyAnswerState();
                        answered[curIdx].textValue = e.target.value;
                        answered[curIdx].selected = e.target.value.trim().length > 0 ? [-1] : [];
                        updateGridAndStats();
                    };
                }
            }, 50);
        }

        setTimeout(() => {
            const btnDoubt = $('btnToggleDoubt');
            if (btnDoubt) {
                btnDoubt.onclick = () => {
                    if (!answered[curIdx]) answered[curIdx] = TSQCB_Utils.emptyAnswerState();
                    answered[curIdx].doubtful = !answered[curIdx].doubtful;
                    renderQ();
                    updateGridAndStats();
                };
            }
            const btnCheck = $('btnCheckReview');
            if (btnCheck) {
                btnCheck.onclick = () => checkReviewAnswer(q);
            }
        }, 50);

        qBox.querySelectorAll('.opt-item').forEach(el => {
            const idx = parseInt(el.getAttribute('data-idx'));
            el.onclick = () => handleOptClick(idx, false);
            el.oncontextmenu = (e) => { e.preventDefault(); handleOptClick(idx, true); return false; };
            let pressTimer;
            el.ontouchstart = () => {
                pressTimer = setTimeout(() => {
                    handleOptClick(idx, true);
                    pressTimer = null;
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 600);
            };
            el.ontouchend = () => { if (pressTimer) clearTimeout(pressTimer); };
            el.ontouchcancel = () => { if (pressTimer) clearTimeout(pressTimer); };
            el.ontouchmove = () => { if (pressTimer) clearTimeout(pressTimer); };
        });

        btnPrev.disabled = curIdx === 0;
        btnNext.disabled = curIdx === totalCount - 1;

        updateGridAndStats();

        if (window.MathJax) MathJax.typesetPromise([qBox]).catch(() => {});
    }

    function checkReviewAnswer(q) {
        if (!answered[curIdx]) answered[curIdx] = TSQCB_Utils.emptyAnswerState();
        if (answered[curIdx].isLocked) return;

        const grade = TSQCB_Utils.gradeAnswer(q, answered[curIdx]);
        if (!grade.answered) {
            alert(q.type === 'Fillintheblank' || q.type === 'essayquestion'
                ? 'Vui lòng nhập câu trả lời trước khi nộp.'
                : 'Vui lòng chọn đáp án trước khi nộp.');
            return;
        }

        answered[curIdx].isLocked = true;
        answered[curIdx].isCorrect = grade.isCorrect;
        recordWrong(q, grade.isCorrect && !answered[curIdx].doubtful);
        renderQ();
        updateGridAndStats();
    }

    function handleOptClick(ansIdx, isDoubt) {
        if (!answered[curIdx]) answered[curIdx] = TSQCB_Utils.emptyAnswerState();
        if (mode === 'review' && answered[curIdx].isLocked) return;

        const q = qData.questions[curIdx];
        const sel = answered[curIdx].selected;

        if (isDoubt) {
            if (q.isMul || q.type === 'Multipleresponse') {
                if (sel.indexOf(ansIdx) === -1) sel.push(ansIdx);
            } else {
                answered[curIdx].selected = [ansIdx];
            }
            answered[curIdx].doubtful = true;
        } else {
            if (q.isMul || q.type === 'Multipleresponse') {
                const p = sel.indexOf(ansIdx);
                if (p > -1) sel.splice(p, 1); else sel.push(ansIdx);
            } else {
                answered[curIdx].selected = [ansIdx];
            }
            answered[curIdx].doubtful = false;
        }
        renderQ();
        updateGridAndStats();
    }

    function submitExam() {
        if (timer) clearInterval(timer);
        timeEndStr = TSQCB_Utils.formatDateTime(new Date());
        scoreCount = 0;

        qData.questions.forEach((q, i) => {
            let st = answered[i];
            const grade = TSQCB_Utils.gradeAnswer(q, st);

            if (grade.answered) {
                st.isCorrect = grade.isCorrect;
                if (grade.isCorrect) scoreCount++;
                recordWrong(q, grade.isCorrect && !st.doubtful);
            } else {
                answered[i] = { selected: [], textValue: '', isCorrect: false };
                recordWrong(q, false);
            }
        });

        updateWrongButtonVisibility();
        showResultScreen();
    }

    function showResultScreen() {
        showScreen('screenResult');
        $('resMainTitle').textContent = qData.title;
        $('resSub1').textContent = 'Tổng điểm: 10, Thời gian: ' + timeTotalStr;
        $('txtTimeStart').textContent = timeStartStr;
        $('txtTimeEnd').textContent = timeEndStr;

        const perc = totalCount > 0 ? Math.round((scoreCount / totalCount) * 100) : 0;
        const p10 = totalCount > 0 ? ((scoreCount / totalCount) * 10).toFixed(1) : 0;
        let timeStr = timeElapsedSec < 60 ? timeElapsedSec + ' giây' : Math.floor(timeElapsedSec / 60) + ' ph ' + (timeElapsedSec % 60) + ' s';

        $('valPercent').textContent = perc + '%';
        $('cPercent').style.background = 'conic-gradient(var(--blue-accent) ' + perc + '%, #f0f0f0 0%)';
        $('valScore').textContent = p10;
        $('cScore').style.background = 'conic-gradient(var(--red-accent) ' + perc + '%, #f0f0f0 0%)';
        $('valTime').textContent = timeStr;
        $('cTime').style.background = 'conic-gradient(var(--green-accent) 100%, #f0f0f0 0%)';

        renderReviewList();
    }

    function renderReviewList() {
        let sCount = 0, dCount = 0, cCount = 0;
        qData.questions.forEach((q, i) => {
            const st = answered[i];
            if (!TSQCB_Utils.hasAnswer(st)) cCount++;
            else if (st.isCorrect) dCount++;
            else sCount++;
        });
        $('fSai').textContent = 'Sai(' + sCount + ')';
        $('fDung').textContent = 'Đúng(' + dCount + ')';
        $('fChuaLam').textContent = 'Chưa làm(' + cCount + ')';
        $('fTatCa').textContent = 'Tất cả(' + totalCount + ')';

        const cont = $('reviewListContainer');
        cont.innerHTML = '';
        const ptsPerQ = totalCount > 0 ? (10 / totalCount) : 0;

        qData.questions.forEach((q, i) => {
            const st = answered[i];
            let status = 'chualam';
            if (TSQCB_Utils.hasAnswer(st)) {
                status = st.isCorrect ? 'dung' : 'sai';
            }
            if (filterMode !== 'all' && filterMode !== status) return;

            let wm = '';
            if (status === 'dung') wm = '<div class="watermark correct">✔</div>';
            if (status === 'sai') wm = '<div class="watermark wrong">✘</div>';

            const ptsEarned = status === 'dung' ? ptsPerQ : 0;
            let optHtml = '', userAnsText = '', corAnsText = '';

            if (q.type === 'Fillintheblank' || q.type === 'essayquestion') {
                const userVal = st && st.textValue ? st.textValue : 'Trống';
                const corAns = q.answers.find(a => a.isCorrect);
                corAnsText = corAns ? TSQCB_Utils.htmlToText(corAns.html) : '';
                userAnsText = userVal;
                optHtml = '<div class="formatted-answer formatted-user-answer">' +
                    (q.type === 'essayquestion' ? '<div style="white-space:pre-wrap;">' + userVal + '</div>' : '<div>' + userVal + '</div>') + '</div>';
            } else {
                q.answers.forEach((ans, j) => {
                    const isCor = ans.isCorrect;
                    const isSel = st && st.selected.includes(j);
                    let c = 'opt-item';
                    if (isCor) c += ' correct selected';
                    else if (isSel) c += ' wrong selected';
                    const radioStyle = q.type === 'Multipleresponse' ? 'border-radius:4px;' : 'border-radius:50%;';
                    const radioInnerStyle = q.type === 'Multipleresponse' ? 'border-radius:2px;' : 'border-radius:50%;';
                    optHtml += '<div class="' + c + '" style="cursor:default;margin-bottom:5px;padding:8px 12px;">' +
                        '<div class="opt-radio" style="' + radioStyle + '"><div class="opt-radio-inner" style="' + radioInnerStyle + '"></div></div>' +
                        '<div class="opt-letter">' + ans.letter + '.</div><div class="q-content">' + ans.html + '</div></div>';
                });
                userAnsText = st && st.selected.length > 0 ? st.selected.map(idx => q.answers[idx].letter).join(', ') : 'Trống';
                corAnsText = q.answers.filter(a => a.isCorrect).map(a => a.letter).join(', ');
            }

            cont.innerHTML += '<div class="review-q-card">' + wm +
                '<div class="rev-q-container">' +
                '<div class="q-header" style="margin-bottom:10px;">' +
                '<div class="q-badge-wrap" style="align-items:center;">' +
                '<div style="font-weight:bold;font-size:17px;">Câu:</div>' +
                '<div class="q-badge-num">' + (i + 1) + '/' + totalCount + '</div>' +
                '<div class="q-badge-type">' + TSQCB_Utils.getQuestionTypeLabel(q.type) + '</div></div>' +
                '<div class="q-content">' + q.contentHtml + ' <span style="color:#999;font-size:13px;">(' + ptsPerQ.toFixed(2) + ' Điểm)</span></div>' +
                '<div style="clear:both;"></div></div>' +
                '<div class="options-list" style="margin-bottom:15px;">' + optHtml + '</div>' +
                '<div class="rev-bot" style="justify-content:space-between;">' +
                '<div style="display:flex;gap:20px;flex-wrap:wrap;">' +
                '<div>Đáp Án Của Bạn: <b>' + userAnsText + '</b></div>' +
                '<div>Đáp Án Đúng: <b style="color:var(--green-accent);">' + corAnsText + '</b></div></div>' +
                '<div>Điểm: ' + ptsEarned.toFixed(2) + '/' + ptsPerQ.toFixed(2) + '</div></div></div></div>';
        });

        if (window.MathJax) MathJax.typesetPromise([cont]).catch(() => {});
    }

    function renderTopicReviewList() {
        const container = $('topicReviewList');
        container.innerHTML = '';
        originalData.topics.forEach((topic, idx) => {
            const card = document.createElement('div');
            card.className = 'topic-review-card';
            card.innerHTML = '<div class="topic-card-title">' + topic.title + '</div>' +
                '<div class="topic-card-meta">' + topic.questions.length + ' câu hỏi</div>' +
                '<div class="topic-card-actions"><button class="btn-card-action btn-card-start" data-idx="' + idx + '">Ôn tập</button></div>';
            card.querySelector('button').addEventListener('click', () => startTopicReview(idx));
            container.appendChild(card);
        });
    }

    function startTopicReview(idx) {
        mode = 'review';
        reviewSubMode = 'topic';
        const topic = TSQCB_Utils.clone(originalData.topics[idx]);
        TSQCB_Utils.markQuestionsMul(topic.questions);
        qData = topic;
        totalCount = qData.questions.length;
        quizMainTitle.textContent = topic.title + ' (Ôn tập)';
        timerBox.style.display = 'none';
        btnSubmitExam.style.display = 'none';
        resetGame();
        showScreen('screenQuiz');
    }

    function startGeneralReview() {
        mode = 'review';
        reviewSubMode = 'general';
        const flat = TSQCB_Utils.flattenQuestions(originalData);
        qData = { title: originalData.title, questions: TSQCB_Utils.clone(flat) };
        TSQCB_Utils.markQuestionsMul(qData.questions);
        totalCount = qData.questions.length;
        quizMainTitle.textContent = qData.title + ' (Ôn tập)';
        timerBox.style.display = 'none';
        btnSubmitExam.style.display = 'none';
        resetGame();
        showScreen('screenQuiz');
    }

    function setupWrongTopicSelection() {
        const topicContainer = $('wrongTopicSelection');
        const topicList = $('wrongTopicList');
        if (originalData.topics && originalData.topics.length > 1) {
            topicContainer.style.display = 'block';
            let html = '<label style="display:flex;align-items:center;margin-bottom:6px;font-weight:bold;cursor:pointer;"><input type="checkbox" id="wrongTopicAll" checked style="margin-right:8px;"> Chọn tất cả</label><hr style="border:0;border-top:1px solid #ddd;margin:8px 0;">';
            originalData.topics.forEach((t, i) => {
                html += '<label style="display:flex;align-items:center;margin-bottom:6px;cursor:pointer;"><input type="checkbox" class="wrong-topic-chk" value="' + i + '" checked style="margin-right:8px;"> ' + t.title + '</label>';
            });
            topicList.innerHTML = html;
            $('wrongTopicAll').addEventListener('change', (e) => {
                document.querySelectorAll('.wrong-topic-chk').forEach(chk => { chk.checked = e.target.checked; });
            });
            document.querySelectorAll('.wrong-topic-chk').forEach(chk => {
                chk.addEventListener('change', () => {
                    const allChecked = Array.from(document.querySelectorAll('.wrong-topic-chk')).every(c => c.checked);
                    $('wrongTopicAll').checked = allChecked;
                });
            });
        } else if (topicContainer) {
            topicContainer.style.display = 'none';
        }
    }

    function bindEvents() {
        $('btnModeReview').addEventListener('click', startGeneralReview);
        $('btnModeExam').addEventListener('click', () => showScreen('screenSetup'));
        $('btnBackHomeFromSetup').addEventListener('click', () => showScreen('screenHome'));
        $('btnModeReviewWrong').addEventListener('click', () => {
            if (Object.keys(wrongHistory).length === 0) {
                alert('Chưa có câu sai nào.\nHãy làm bài ôn tập hoặc thi thử trước — hệ thống sẽ tự ghi nhận các câu bạn trả lời sai.');
                return;
            }
            setupWrongTopicSelection();
            showScreen('screenSetupWrong');
        });
        $('btnBackHomeFromSetupWrong').addEventListener('click', () => showScreen('screenHome'));
        $('btnModeTopicReview').addEventListener('click', () => {
            renderTopicReviewList();
            showScreen('screenTopicReview');
        });
        $('btnBackHomeFromTopic').addEventListener('click', () => showScreen('screenHome'));

        btnExitTop.addEventListener('click', () => $('modalConfirmExit').classList.add('active'));
        $('btnCancelExit').addEventListener('click', () => $('modalConfirmExit').classList.remove('active'));
        $('btnConfirmExit').addEventListener('click', () => {
            $('modalConfirmExit').classList.remove('active');
            if (timer) clearInterval(timer);
            const activeScreen = document.querySelector('.screen.active');
            const activeId = activeScreen ? activeScreen.id : '';
            if (mode === 'review' && reviewSubMode === 'topic' && (activeId === 'screenQuiz' || activeId === 'screenResult')) {
                showScreen('screenTopicReview');
            } else {
                showScreen('screenHome');
            }
        });

        $('btnStartExam').addEventListener('click', () => {
            const count = parseInt($('examQCount').value);
            const timeM = parseInt($('examTime').value);
            if (isNaN(count) || count < 1) return alert('Số lượng không hợp lệ');
            if (isNaN(timeM) || timeM < 1) return alert('Thời gian không hợp lệ');

            timeTotalStr = timeM + ' phút';
            let cQ = TSQCB_Utils.clone(TSQCB_Utils.flattenQuestions(originalData));
            TSQCB_Utils.shuffle(cQ);
            cQ = cQ.slice(0, Math.min(count, cQ.length));
            cQ.forEach(q => TSQCB_Utils.prepareQuestion(q));
            qData = { title: originalData.title, questions: cQ };
            totalCount = cQ.length;
            mode = 'exam';
            quizMainTitle.textContent = qData.title;
            timerBox.style.display = 'block';
            btnSubmitExam.style.display = 'flex';
            timeStartStr = TSQCB_Utils.formatDateTime(new Date());
            timeRem = timeM * 60;
            timeElapsedSec = 0;
            updateTimerUI();
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                timeRem--;
                timeElapsedSec++;
                updateTimerUI();
                if (timeRem <= 0) {
                    clearInterval(timer);
                    alert('Đã hết thời gian làm bài! Hệ thống tự động thu bài.');
                    submitExam();
                }
            }, 1000);
            resetGame();
            showScreen('screenQuiz');
        });

        $('btnStartWrongReview').addEventListener('click', () => {
            const count = parseInt($('wrongQCount').value);
            const minCount = parseInt($('wrongMinCount').value);
            if (isNaN(count) || count < 1) return alert('Số lượng không hợp lệ');
            if (isNaN(minCount) || minCount < 1) return alert('Số lần sai không hợp lệ');

            timeTotalStr = 'Không giới hạn';
            let selectedTopics = [];
            if (originalData.topics && originalData.topics.length > 1) {
                document.querySelectorAll('.wrong-topic-chk:checked').forEach(chk => {
                    selectedTopics.push(parseInt(chk.value));
                });
                if (selectedTopics.length === 0) return alert('Vui lòng chọn ít nhất một nội dung ôn tập.');
            }

            let allQ = getFlatQuestionsFromTopics(selectedTopics.length ? selectedTopics : null);
            const uniqueQs = {};
            allQ.forEach(q => { uniqueQs[q.hash] = q; });

            let cQ = [];
            for (const key in uniqueQs) {
                const q = uniqueQs[key];
                if (wrongHistory[q.hash] && wrongHistory[q.hash] >= minCount) {
                    cQ.push(TSQCB_Utils.clone(q));
                }
            }
            if (cQ.length === 0) return alert('Không có câu hỏi nào bị sai từ ' + minCount + ' lần trở lên.');

            TSQCB_Utils.shuffle(cQ);
            cQ = cQ.slice(0, Math.min(count, cQ.length));
            cQ.forEach(q => TSQCB_Utils.prepareQuestion(q));
            qData = { title: originalData.title, questions: cQ };
            totalCount = cQ.length;
            mode = 'review';
            reviewSubMode = 'wrong';
            quizMainTitle.textContent = qData.title + ' (Ôn câu sai)';
            timerBox.style.display = 'none';
            btnSubmitExam.style.display = 'none';
            if (timer) clearInterval(timer);
            resetGame();
            showScreen('screenQuiz');
        });

        btnPrev.onclick = () => { if (curIdx > 0) { curIdx--; renderQ(); } };
        btnNext.onclick = () => { if (curIdx < totalCount - 1) { curIdx++; renderQ(); } };

        btnSubmitExam.onclick = () => $('modalConfirmSubmit').classList.add('active');
        $('btnCancelSubmit').addEventListener('click', () => $('modalConfirmSubmit').classList.remove('active'));
        $('btnConfirmSubmit').addEventListener('click', () => {
            $('modalConfirmSubmit').classList.remove('active');
            submitExam();
        });

        $('tabKQ').onclick = () => {
            $('tabKQ').classList.add('active');
            $('tabPT').classList.remove('active');
            $('contentKQ').classList.add('active');
            $('contentPT').classList.remove('active');
        };
        $('tabPT').onclick = () => {
            $('tabPT').classList.add('active');
            $('tabKQ').classList.remove('active');
            $('contentPT').classList.add('active');
            $('contentKQ').classList.remove('active');
        };

        ['fSai', 'fDung', 'fChuaLam', 'fTatCa'].forEach(id => {
            $(id).onclick = (e) => {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                if (id === 'fSai') filterMode = 'sai';
                if (id === 'fDung') filterMode = 'dung';
                if (id === 'fChuaLam') filterMode = 'chualam';
                if (id === 'fTatCa') filterMode = 'all';
                renderReviewList();
            };
        });

        $('btnLogout').addEventListener('click', () => {
            if (confirm('Bạn có muốn đăng xuất?')) {
                TSQCB_Auth.logout();
                window.location.href = 'login.html';
            }
        });

        if (TSQCB_Auth.isAdmin()) {
            $('btnAdminLink').style.display = 'flex';
            $('btnAdminLink').addEventListener('click', () => { window.location.href = 'admin.html'; });
        }
    }

    async function init() {
        if (!TSQCB_Auth.requireAuth()) return;
        await TSQCB_Auth.initUsers();

        currentUser = TSQCB_Auth.getCurrentUser();
        wrongHistory = TSQCB_Storage.getWrongHistory(currentUser);
        correctHistory = TSQCB_Storage.getCorrectHistory(currentUser);

        screenHome = $('screenHome');
        screenSetup = $('screenSetup');
        screenQuiz = $('screenQuiz');
        screenResult = $('screenResult');
        btnExitTop = $('btnExitTop');
        quizMainTitle = $('quizMainTitle');
        qBox = $('qBox');
        timeLeftDisplay = $('timeLeftDisplay');
        progressText = $('progressText');
        percentText = $('percentText');
        timerBox = $('timerBox');
        btnSubmitExam = $('btnSubmitExam');
        gridQ = $('gridQ');
        btnPrev = $('btnPrev');
        btnNext = $('btnNext');

        $('userDisplayName').textContent = currentUser.fullName || currentUser.militaryId || '';

        try {
            originalData = await TSQCB_Storage.loadQuizData();
            if (TSQCB_Excel.repairEssayQuestions(originalData)) {
                TSQCB_Storage.saveLocalData(originalData);
            }
            // Cache lần đầu để dùng offline (không cần HTTP server lần sau)
            if (!TSQCB_Storage.getLocalData()) {
                TSQCB_Storage.saveLocalData(originalData);
            }
        } catch (err) {
            alert(err.message);
            return;
        }

        const totalQ = TSQCB_Utils.countAllQuestions(originalData);
        $('homeTitle').textContent = originalData.title || TSQCB_CONFIG.APP_NAME;
        $('examQCount').value = totalQ;
        $('examQCount').max = totalQ;
        $('examQCountLabel').textContent = 'Số lượng câu hỏi (Tối đa ' + totalQ + '):';

        if (originalData.topics && originalData.topics.length > 1) {
            $('btnModeTopicReview').style.display = 'flex';
        }

        updateWrongButtonVisibility();
        bindEvents();
        showScreen('screenHome');
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => TSQCB_App.init());
