/**
 * Hàm tiện ích dùng chung
 */
const TSQCB_Utils = {
    /** Shorthand getElementById */
    $(id) {
        return document.getElementById(id);
    },

    /** Trộn ngẫu nhiên mảng (Fisher-Yates) */
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    /** Hash nội dung câu hỏi để theo dõi lịch sử sai */
    hashStr(str) {
        let hash = 0;
        if (!str) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash;
    },

    /** Định dạng ngày giờ hiển thị */
    formatDateTime(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        let h = date.getHours();
        const min = String(date.getMinutes()).padStart(2, '0');
        const sec = String(date.getSeconds()).padStart(2, '0');
        const ampm = h >= 12 ? 'pm' : 'am';
        h = h % 12;
        h = h || 12;
        return `${y}-${m}-${d} ${String(h).padStart(2, '0')}:${min}:${sec} ${ampm}`;
    },

    /** Nhãn loại câu hỏi */
    getQuestionTypeLabel(type) {
        const map = {
            multiplechoice: 'Trắc Nghiệm',
            Multipleresponse: 'Nhiều Đáp Án',
            Truefalse: 'Đúng/Sai',
            Fillintheblank: 'Điền Khuyết',
            essayquestion: 'Tự Luận'
        };
        return map[type] || 'Trắc Nghiệm';
    },

    /** Deep clone object */
    clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /** Lấy text thuần từ HTML — giữ xuống dòng từ thẻ br */
    htmlToText(html) {
        const div = document.createElement('div');
        div.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n');
        return div.textContent.trim();
    },

    /** Gán letter cho các đáp án */
    assignAnswerLetters(answers) {
        const lbls = TSQCB_CONFIG.ANSWER_LABELS;
        answers.forEach((a, i) => {
            if (i < lbls.length) a.letter = lbls[i];
        });
    },

    /** Chuẩn bị câu hỏi trước khi làm bài */
    prepareQuestion(q) {
        if (!q.noShuffle) {
            this.shuffle(q.answers);
        }
        this.assignAnswerLetters(q.answers);
        q.isMul = q.answers.filter(a => a.isCorrect).length > 1;
        if (!q.hash) q.hash = this.hashStr(q.contentHtml);
        return q;
    },

    /** Tổng số câu hỏi trong dữ liệu */
    countAllQuestions(data) {
        if (!data || !data.topics) return 0;
        return data.topics.reduce((sum, t) => sum + (t.questions ? t.questions.length : 0), 0);
    },

    /** Flatten tất cả câu hỏi */
    flattenQuestions(data) {
        if (!data || !data.topics) return [];
        return data.topics.flatMap(t => t.questions || []);
    },

    /** Escape HTML cho attribute hoặc text node */
    escapeAttr(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    escapeHtml(str) {
        return this.escapeAttr(str);
    },

    /** State mặc định khi bắt đầu trả lời một câu */
    emptyAnswerState() {
        return { selected: [], textValue: '', doubtful: false, isLocked: false };
    },

    /** User đã chọn/nhập đáp án chưa */
    hasAnswer(answerState) {
        if (!answerState) return false;
        return (answerState.selected && answerState.selected.length > 0) ||
            !!(answerState.textValue && answerState.textValue.trim());
    },

    /** Gán cờ isMul cho danh sách câu hỏi */
    markQuestionsMul(questions) {
        (questions || []).forEach(q => {
            q.isMul = q.answers.filter(a => a.isCorrect).length > 1;
        });
    },

    /**
     * Chấm một câu hỏi
     * @returns {{ answered: boolean, isCorrect: boolean }}
     */
    gradeAnswer(q, answerState) {
        if (!answerState) return { answered: false, isCorrect: false };

        if (q.type === 'Fillintheblank' || q.type === 'essayquestion') {
            if (!answerState.textValue || !answerState.textValue.trim()) {
                return { answered: false, isCorrect: false };
            }
            const corAns = q.answers.find(a => a.isCorrect);
            if (!corAns) return { answered: true, isCorrect: false };
            const corText = this.htmlToText(corAns.html).toLowerCase();
            const userText = answerState.textValue.trim().toLowerCase();
            return { answered: true, isCorrect: corText === userText };
        }

        if (!answerState.selected || !answerState.selected.length) {
            return { answered: false, isCorrect: false };
        }
        const corIdx = q.answers.map((a, j) => a.isCorrect ? j : -1).filter(j => j !== -1);
        const sel = answerState.selected.slice().sort();
        corIdx.sort();
        return { answered: true, isCorrect: JSON.stringify(sel) === JSON.stringify(corIdx) };
    },

    /** Tạo ID mới cho câu hỏi */
    nextQuestionId(data) {
        let max = 0;
        this.flattenQuestions(data).forEach(q => {
            if (q.id && q.id > max) max = q.id;
        });
        return max + 1;
    }
};
