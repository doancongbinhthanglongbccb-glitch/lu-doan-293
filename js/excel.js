/**
 * Import/Export Excel theo mẫu thực tế:
 * - Trắc nghiệm: Câu hỏi | Phương án | Đáp án đúng  (Quân sự.xlsx)
 * - Tự luận:     Câu hỏi | Câu trả lời / Đáp án mẫu (Chính trị, Hậu cần, Kỹ thuật)
 */
const TSQCB_Excel = {
    TEMPLATE_FILES: [
        { file: 'data/Quân sự.xlsx', label: 'Mẫu trắc nghiệm (Quân sự)' },
        { file: 'data/Chính trị.xlsx', label: 'Mẫu tự luận (Chính trị)' },
        { file: 'data/Hậu cần.xlsx', label: 'Mẫu tự luận (Hậu cần)' },
        { file: 'data/Kỹ thuật.xlsx', label: 'Mẫu tự luận (Kỹ thuật)' }
    ],

    /** Lấy text từ row theo nhiều tên cột */
    cell(row, ...keys) {
        for (const k of keys) {
            if (row[k] !== undefined && row[k] !== '') {
                return String(row[k]).trim();
            }
        }
        return '';
    },

    /** Chuẩn hóa xuống dòng từ Excel (cả \n lẫn nhiều space) */
    normalizeExcelText(text) {
        if (!text) return '';
        let t = String(text);
        t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // "text.   - Mục tiếp" hoặc ". - Mục" (Chính trị.xlsx)
        t = t.replace(/\.\s+-\s+/g, '.\n- ');
        t = t.replace(/\s{2,}- /g, '\n- ');
        // "+ 1-", "+ 1=>", "+ 2"
        t = t.replace(/\s+\+\s*(\d+)\s*([-=>])/g, '\n+ $1$2');
        // "a) " "b) " sau dấu chấm + nhiều space
        t = t.replace(/\.\s{2,}(?=[a-z]\))/gi, '.\n');
        // "1. xxx" / "2. xxx" khi ngăn bởi nhiều space (không phá số thập phân đơn)
        t = t.replace(/\s{2,}(?=\d+\.\s)/g, '\n');
        return t.trim();
    },

    /** Chuyển text Excel → HTML có xuống dòng */
    textToHtml(text) {
        if (!text) return '<p></p>';
        const normalized = this.normalizeExcelText(text);
        const escaped = normalized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return '<p>' + escaped.replace(/\n/g, '<br>') + '</p>';
    },

    /** Text để hiển thị trong textarea admin — luôn có xuống dòng như Excel */
    htmlToEditText(html) {
        return this.normalizeExcelText(TSQCB_Utils.htmlToText(html));
    },

    /** Hiển thị đáp án — xử lý cả dữ liệu import cũ */
    formatAnswerForDisplay(html) {
        return this.textToHtml(this.htmlToEditText(html));
    },

    /** Sửa format tự luận đã lưu (localStorage cũ chưa có br) */
    repairEssayQuestions(quizData) {
        let changed = false;
        (quizData.topics || []).forEach(topic => {
            (topic.questions || []).forEach(q => {
                if (q.type !== 'essayquestion' && q.type !== 'Fillintheblank') return;
                const newContent = this.textToHtml(this.htmlToEditText(q.contentHtml));
                if (newContent !== q.contentHtml) {
                    q.contentHtml = newContent;
                    q.hash = TSQCB_Utils.hashStr(q.contentHtml);
                    changed = true;
                }
                (q.answers || []).forEach(a => {
                    const newHtml = this.textToHtml(this.htmlToEditText(a.html));
                    if (newHtml !== a.html) {
                        a.html = newHtml;
                        changed = true;
                    }
                });
            });
        });
        return changed;
    },

    /** Parse "A. xxx\r\nB. yyy" thành mảng đáp án */
    parseOptionsText(optionsText) {
        const answers = [];
        const lines = optionsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        lines.forEach(line => {
            const m = line.match(/^([A-J])[.)]\s*(.*)$/i);
            if (m) {
                answers.push({
                    letter: m[1].toUpperCase(),
                    html: this.textToHtml(m[2].trim()),
                    isCorrect: false
                });
            }
        });
        return answers;
    },

    /** Đánh dấu đáp án đúng từ chuỗi "C. 20 x 30cm" */
    markCorrectAnswer(answers, correctText) {
        if (!correctText || !answers.length) return;
        const letterMatch = correctText.match(/^([A-J])[.)]/i);
        if (letterMatch) {
            const ans = answers.find(a => a.letter === letterMatch[1].toUpperCase());
            if (ans) { ans.isCorrect = true; return; }
        }
        const corBody = correctText.replace(/^[A-J][.)]\s*/i, '').trim().toLowerCase();
        answers.forEach(a => {
            const body = TSQCB_Utils.htmlToText(a.html).toLowerCase();
            if (body === corBody || correctText.toLowerCase().includes(body)) {
                a.isCorrect = true;
            }
        });
    },

    /** Parse 1 dòng trắc nghiệm */
    parseTracNghiemRow(row) {
        const question = this.cell(row, 'Câu hỏi');
        const optionsText = this.cell(row, 'Phương án');
        const correctText = this.cell(row, 'Đáp án đúng');
        if (!question || !optionsText) return null;

        const answers = this.parseOptionsText(optionsText);
        if (!answers.length) return null;
        this.markCorrectAnswer(answers, correctText);
        if (!answers.some(a => a.isCorrect) && correctText) {
            answers[0].isCorrect = true;
        }

        return {
            contentHtml: this.textToHtml(question),
            type: 'multiplechoice',
            noShuffle: false,
            answers,
            isMul: answers.filter(a => a.isCorrect).length > 1
        };
    },

    /** Parse 1 dòng tự luận */
    parseTuLuanRow(row) {
        const question = this.cell(row, 'Câu hỏi');
        const sampleAnswer = this.cell(row, 'Câu trả lời', 'Đáp án mẫu');
        if (!question) return null;

        return {
            contentHtml: this.textToHtml(question),
            type: 'essayquestion',
            noShuffle: false,
            answers: [{
                letter: 'A',
                html: this.textToHtml(sampleAnswer),
                isCorrect: true
            }]
        };
    },

    /** Parse 1 dòng — tự nhận dạng trắc nghiệm / tự luận */
    parseRow(row) {
        const optionsText = this.cell(row, 'Phương án');
        if (optionsText) return this.parseTracNghiemRow(row);
        return this.parseTuLuanRow(row);
    },

    /** Import toàn bộ workbook → { topicTitle, questions } */
    importWorkbook(wb, fileName) {
        const topicTitle = (fileName || 'Chủ đề mới').replace(/\.xlsx?$/i, '').trim();
        const questions = [];
        let nextId = 1;

        wb.SheetNames.forEach(sheetName => {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
            rows.forEach(row => {
                const q = this.parseRow(row);
                if (!q) return;
                q.id = nextId++;
                q.hash = TSQCB_Utils.hashStr(q.contentHtml);
                TSQCB_Utils.assignAnswerLetters(q.answers);
                questions.push(q);
            });
        });

        return { topicTitle, questions };
    },

    /** Chuyển câu hỏi → dòng Excel */
    questionToRow(q) {
        const question = TSQCB_Utils.htmlToText(q.contentHtml);
        if (q.type === 'essayquestion' || q.type === 'Fillintheblank') {
            const cor = q.answers.find(a => a.isCorrect);
            const text = cor ? this.htmlToEditText(cor.html) : '';
            return {
                'Câu hỏi': this.htmlToEditText(q.contentHtml),
                'Câu trả lời': text.replace(/\n/g, '\r\n')
            };
        }
        const options = q.answers.map(a =>
            a.letter + '. ' + TSQCB_Utils.htmlToText(a.html)
        ).join('\r\n');
        const correct = q.answers.filter(a => a.isCorrect).map(a =>
            a.letter + '. ' + TSQCB_Utils.htmlToText(a.html)
        ).join('\r\n');
        return {
            'Câu hỏi': question,
            'Phương án': options,
            'Đáp án đúng': correct
        };
    },

    /** Export toàn bộ dữ liệu — mỗi chủ đề 1 sheet */
    exportWorkbook(quizData) {
        const wb = XLSX.utils.book_new();
        quizData.topics.forEach(topic => {
            const rows = topic.questions.map(q => this.questionToRow(q));
            const ws = XLSX.utils.json_to_sheet(rows);
            let sheetName = topic.title.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        XLSX.writeFile(wb, 'TSQCB_export_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    },

    /** Render menu tải mẫu Excel */
    renderTemplateMenu(container) {
        container.innerHTML = '';
        this.TEMPLATE_FILES.forEach(t => {
            const a = document.createElement('a');
            a.href = t.file;
            a.download = t.file.split('/').pop();
            a.className = 'template-link';
            a.textContent = t.label;
            container.appendChild(a);
        });
    }
};
