const DANGEROUS_TAG = /<\/?(?:script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math|img|a|video|audio)[^>]*>/gi;
const EVENT_ATTR = /\s(on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))/gi;
const JS_URL = /javascript:/gi;

/**
 * Server-side HTML sanitizer for quiz content (defense in depth on save).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRichHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return html.replace(DANGEROUS_TAG, '').replace(EVENT_ATTR, '').replace(JS_URL, '');
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
 * @param {object} data
 * @returns {object}
 */
export function sanitizeQuizDataHtml(data) {
    if (!data?.topics) return data;
    data.topics.forEach(topic => {
        (topic.questions || []).forEach(sanitizeQuestionHtml);
    });
    return data;
}
