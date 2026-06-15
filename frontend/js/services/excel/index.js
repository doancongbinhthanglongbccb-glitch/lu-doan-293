import { htmlToText } from '../../utils/html.js';
import { assignQuestionHash } from '../../utils/hash.js';
import { assignAnswerLetters } from '../../core/grading.js';
import { textToHtml, htmlToEditText } from './formatters.js';

/** Excel template downloads — thêm file .xlsx vào frontend/data/templates/ rồi bổ sung tại đây */
export const TEMPLATE_FILES = [];

/**
 * Lấy text từ row theo nhiều tên cột.
 * @param {object} row
 * @param {...string} keys
 * @returns {string}
 */
export function cell(row, ...keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== '') {
            return String(row[k]).trim();
        }
    }
    return '';
}

/**
 * Parse "A. xxx\r\nB. yyy" thành mảng đáp án.
 * @param {string} optionsText
 * @returns {object[]}
 */
export function parseOptionsText(optionsText) {
    const answers = [];
    const lines = optionsText
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
    lines.forEach(line => {
        const m = line.match(/^([A-J])[.)]\s*(.*)$/i);
        if (m) {
            answers.push({
                letter: m[1].toUpperCase(),
                html: textToHtml(m[2].trim()),
                isCorrect: false
            });
        }
    });
    return answers;
}

/**
 * Đánh dấu đáp án đúng từ chuỗi "C. 20 x 30cm".
 * @param {object[]} answers
 * @param {string} correctText
 */
export function markCorrectAnswer(answers, correctText) {
    if (!correctText || !answers.length) return;
    const letterMatch = correctText.match(/^([A-J])[.)]/i);
    if (letterMatch) {
        const ans = answers.find(a => a.letter === letterMatch[1].toUpperCase());
        if (ans) {
            ans.isCorrect = true;
            return;
        }
    }
    const corBody = correctText.replace(/^[A-J][.)]\s*/i, '').trim().toLowerCase();
    answers.forEach(a => {
        const body = htmlToText(a.html).toLowerCase();
        if (body === corBody || correctText.toLowerCase().includes(body)) {
            a.isCorrect = true;
        }
    });
}

/**
 * Parse 1 dòng trắc nghiệm.
 * @param {object} row
 * @returns {object|null}
 */
export function parseTracNghiemRow(row) {
    const question = cell(row, 'Câu hỏi');
    const optionsText = cell(row, 'Phương án');
    const correctText = cell(row, 'Đáp án đúng');
    if (!question || !optionsText) return null;

    const answers = parseOptionsText(optionsText);
    if (!answers.length) return null;
    markCorrectAnswer(answers, correctText);
    if (!answers.some(a => a.isCorrect) && correctText) {
        answers[0].isCorrect = true;
    }

    return {
        contentHtml: textToHtml(question),
        type: 'multiplechoice',
        noShuffle: false,
        answers,
        isMul: answers.filter(a => a.isCorrect).length > 1
    };
}

/**
 * Parse 1 dòng tự luận.
 * @param {object} row
 * @returns {object|null}
 */
export function parseTuLuanRow(row) {
    const question = cell(row, 'Câu hỏi');
    const sampleAnswer = cell(row, 'Câu trả lời', 'Đáp án mẫu');
    if (!question) return null;

    return {
        contentHtml: textToHtml(question),
        type: 'essayquestion',
        noShuffle: false,
        answers: [{ letter: 'A', html: textToHtml(sampleAnswer), isCorrect: true }]
    };
}

/**
 * Parse 1 dòng — tự nhận dạng trắc nghiệm / tự luận.
 * @param {object} row
 * @returns {object|null}
 */
export function parseRow(row) {
    const optionsText = cell(row, 'Phương án');
    if (optionsText) return parseTracNghiemRow(row);
    return parseTuLuanRow(row);
}

/**
 * Import toàn bộ workbook.
 * @param {object} wb - SheetJS workbook
 * @param {string} fileName
 * @returns {{ topicTitle: string, questions: object[] }}
 */
export function importWorkbook(wb, fileName) {
    const topicTitle = (fileName || 'Chủ đề mới').replace(/\.xlsx?$/i, '').trim();
    const questions = [];
    let nextId = 1;

    wb.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        rows.forEach(row => {
            const q = parseRow(row);
            if (!q) return;
            q.id = nextId++;
            assignQuestionHash(q);
            assignAnswerLetters(q.answers);
            questions.push(q);
        });
    });

    return { topicTitle, questions };
}

/**
 * Chuyển câu hỏi → dòng Excel.
 * @param {object} q
 * @returns {object}
 */
export function questionToRow(q) {
    const question = htmlToText(q.contentHtml);
    if (q.type === 'essayquestion' || q.type === 'Fillintheblank') {
        const cor = q.answers.find(a => a.isCorrect);
        const text = cor ? htmlToEditText(cor.html) : '';
        return {
            'Câu hỏi': htmlToEditText(q.contentHtml),
            'Câu trả lời': text.replace(/\n/g, '\r\n')
        };
    }
    const options = q.answers.map(a => a.letter + '. ' + htmlToText(a.html)).join('\r\n');
    const correct = q.answers
        .filter(a => a.isCorrect)
        .map(a => a.letter + '. ' + htmlToText(a.html))
        .join('\r\n');
    return { 'Câu hỏi': question, 'Phương án': options, 'Đáp án đúng': correct };
}

/**
 * Export toàn bộ dữ liệu — mỗi chủ đề 1 sheet.
 * @param {object} quizData
 */
export function exportWorkbook(quizData) {
    const wb = XLSX.utils.book_new();
    quizData.topics.forEach(topic => {
        const rows = topic.questions.map(q => questionToRow(q));
        const ws = XLSX.utils.json_to_sheet(rows);
        const sheetName = topic.title.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    XLSX.writeFile(wb, 'cbquiz_export_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/**
 * Sửa format tự luận đã lưu (localStorage cũ chưa có br).
 * @param {object} quizData
 * @returns {boolean}
 */
export function repairEssayQuestions(quizData) {
    let changed = false;
    (quizData.topics || []).forEach(topic => {
        (topic.questions || []).forEach(q => {
            if (q.type !== 'essayquestion' && q.type !== 'Fillintheblank') return;
            const newContent = textToHtml(htmlToEditText(q.contentHtml));
            if (newContent !== q.contentHtml) {
                q.contentHtml = newContent;
                assignQuestionHash(q);
                changed = true;
            }
            (q.answers || []).forEach(a => {
                const newHtml = textToHtml(htmlToEditText(a.html));
                if (newHtml !== a.html) {
                    a.html = newHtml;
                    changed = true;
                }
            });
        });
    });
    return changed;
}

/**
 * Render menu tải mẫu Excel.
 * @param {HTMLElement} container
 */
export function renderTemplateMenu(container) {
    if (!container) return;
    container.innerHTML = '';
    if (TEMPLATE_FILES.length === 0) {
        container.hidden = true;
        return;
    }
    container.hidden = false;
    TEMPLATE_FILES.forEach(t => {
        const a = document.createElement('a');
        a.href = t.file;
        a.download = t.file.split('/').pop();
        a.className = 'template-link';
        a.textContent = t.label;
        container.appendChild(a);
    });
}

// Re-export formatters for convenience
export { textToHtml, htmlToEditText, formatAnswerForDisplay } from './formatters.js';
