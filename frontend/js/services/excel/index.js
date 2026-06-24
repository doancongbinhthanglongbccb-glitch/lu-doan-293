import { htmlToText } from '../../utils/html.js';
import { assignQuestionHash } from '../../utils/hash.js';
import { assignAnswerLetters, nextQuestionId } from '../../core/grading.js';
import { textToHtml, htmlToEditText } from './formatters.js';
import { QUESTION_TYPES } from '../../config/constants.js';
import { getLeafTopics } from '../../core/topic-tree.js';
import { EXCEL_TEMPLATE_TOPICS } from '../../../../shared/constants/excel-template.js';

/** Excel template downloads — paths relative to frontend root */
export const TEMPLATE_FILES = EXCEL_TEMPLATE_TOPICS.map(t => ({
    label: t.label,
    file: `data/${t.fileName}`
}));

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
    const correctCount = answers.filter(a => a.isCorrect).length;
    const unmatchedCorrect = !!(correctText && correctCount === 0);

    return {
        contentHtml: textToHtml(question),
        type:
            correctCount > 1 ? QUESTION_TYPES.MULTIPLE_RESPONSE : QUESTION_TYPES.MULTIPLE_CHOICE,
        noShuffle: false,
        answers,
        isMul: correctCount > 1,
        _importWarning: unmatchedCorrect
            ? `Đáp án đúng không khớp phương án: "${correctText.substring(0, 50)}"`
            : undefined
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
 * @param {object} [quizData] - Dữ liệu hiện tại để gán ID liên tục
 * @returns {{ topicTitle: string, questions: object[], warnings: string[] }}
 */
export function importWorkbook(wb, fileName, quizData = null) {
    const topicTitle = (fileName || 'Chủ đề mới').replace(/\.xlsx?$/i, '').trim();
    const questions = [];
    const warnings = [];
    let nextId = quizData ? nextQuestionId(quizData) : 1;

    wb.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        rows.forEach(row => {
            const q = parseRow(row);
            if (!q) return;
            if (q._importWarning) {
                warnings.push(`Câu ${nextId}: ${q._importWarning}`);
                delete q._importWarning;
            }
            q.id = nextId++;
            assignAnswerLetters(q.answers);
            questions.push(q);
        });
    });

    return { topicTitle, questions, warnings };
}

/**
 * Chuyển câu hỏi → dòng Excel.
 * @param {object} q
 * @returns {object}
 */
export function questionToRow(q) {
    if (q.type === 'essayquestion' || q.type === 'Fillintheblank') {
        const cor = q.answers.find(a => a.isCorrect);
        const text = cor ? htmlToEditText(cor.html) : '';
        return {
            'Câu hỏi': htmlToEditText(q.contentHtml),
            'Câu trả lời': text.replace(/\n/g, '\r\n')
        };
    }
    const options = q.answers.map(a => a.letter + '. ' + htmlToEditText(a.html)).join('\r\n');
    const correct = q.answers
        .filter(a => a.isCorrect)
        .map(a => a.letter + '. ' + htmlToEditText(a.html))
        .join('\r\n');
    return {
        'Câu hỏi': htmlToEditText(q.contentHtml),
        'Phương án': options,
        'Đáp án đúng': correct
    };
}

/**
 * Export toàn bộ dữ liệu — mỗi chủ đề 1 sheet.
 * @param {object} quizData
 */
export function exportWorkbook(quizData) {
    const wb = XLSX.utils.book_new();
    (quizData.topics || []).forEach(topic => {
        if (topic.children?.length) {
            topic.children.forEach(child => {
                const rows = (child.questions || []).map(q => questionToRow(q));
                const ws = XLSX.utils.json_to_sheet(rows);
                const sheetName = `${topic.title} - ${child.title}`.substring(0, 31);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            });
        } else {
            const rows = (topic.questions || []).map(q => questionToRow(q));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, topic.title.substring(0, 31));
        }
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
        const lists = topic.children?.length
            ? topic.children.map(c => c.questions || [])
            : [topic.questions || []];
        lists.forEach(questions => {
            questions.forEach(q => {
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
