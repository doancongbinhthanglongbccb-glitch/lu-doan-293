import { htmlToText } from '../../utils/html.js';

/**
 * Chuẩn hóa xuống dòng từ Excel (cả \n lẫn nhiều space).
 * @param {string} text
 * @returns {string}
 */
export function normalizeExcelText(text) {
    if (!text) return '';
    let t = String(text);
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    t = t.replace(/\.\s+-\s+/g, '.\n- ');
    t = t.replace(/\s{2,}- /g, '\n- ');
    t = t.replace(/\s+\+\s*(\d+)\s*([-=>])/g, '\n+ $1$2');
    t = t.replace(/\.\s{2,}(?=[a-z]\))/gi, '.\n');
    t = t.replace(/\s{2,}(?=\d+\.\s)/g, '\n');
    return t.trim();
}

/**
 * Chuyển text Excel → HTML có xuống dòng.
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
    if (!text) return '<p></p>';
    const normalized = normalizeExcelText(text);
    const escaped = normalized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return '<p>' + escaped.replace(/\n/g, '<br>') + '</p>';
}

/**
 * Text để hiển thị trong textarea admin.
 * @param {string} html
 * @returns {string}
 */
export function htmlToEditText(html) {
    return normalizeExcelText(htmlToText(html));
}

/**
 * Hiển thị đáp án — xử lý cả dữ liệu import cũ.
 * @param {string} html
 * @returns {string}
 */
export function formatAnswerForDisplay(html) {
    return textToHtml(htmlToEditText(html));
}
