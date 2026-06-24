import { RICH_HTML_ALLOWED_TAGS, RICH_HTML_ALLOWED_ATTRS } from '../../../shared/constants/sanitize.js';

const ALLOWED_TAGS = new Set(RICH_HTML_ALLOWED_TAGS);
const ALLOWED_ATTRS = new Set(RICH_HTML_ALLOWED_ATTRS);

/**
 * @param {Element} node
 */
function sanitizeElementTree(node) {
    const children = [...node.childNodes];
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            if (!ALLOWED_TAGS.has(tag)) {
                while (child.firstChild) {
                    node.insertBefore(child.firstChild, child);
                }
                node.removeChild(child);
                continue;
            }

            [...child.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (
                    name.startsWith('on') ||
                    !ALLOWED_ATTRS.has(name) ||
                    value.startsWith('javascript:') ||
                    value.startsWith('data:text/html')
                ) {
                    child.removeAttribute(attr.name);
                }
            });

            sanitizeElementTree(child);
        } else if (child.nodeType === Node.COMMENT_NODE) {
            node.removeChild(child);
        }
    }
}

/**
 * Strip XSS vectors from rich HTML (quiz questions / answers).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRichHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    sanitizeElementTree(doc.body);
    return doc.body.innerHTML;
}

/**
 * @param {object} question
 * @returns {object}
 */
export function sanitizeQuestionHtml(question) {
    if (!question || typeof question !== 'object') return question;
    if (question.contentHtml) {
        question.contentHtml = sanitizeRichHtml(question.contentHtml);
    }
    if (Array.isArray(question.answers)) {
        question.answers.forEach(a => {
            if (a?.html) a.html = sanitizeRichHtml(a.html);
        });
    }
    return question;
}

/**
 * @param {object} quizData
 * @returns {object}
 */
export function sanitizeQuizDataHtml(quizData) {
    if (!quizData?.topics) return quizData;
    quizData.topics.forEach(topic => {
        if (Array.isArray(topic.children) && topic.children.length > 0) {
            topic.children.forEach(child => (child.questions || []).forEach(sanitizeQuestionHtml));
        } else {
            (topic.questions || []).forEach(sanitizeQuestionHtml);
        }
    });
    return quizData;
}
