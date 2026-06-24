/**
 * Tiện ích chủ đề 2 cấp: nhóm lớn (parent) → môn con (child/leaf).
 * Topic gốc không có children = leaf legacy (tương thích dữ liệu cũ).
 */

/**
 * @param {object} topic
 * @returns {boolean}
 */
export function isTopicParent(topic) {
    return Array.isArray(topic?.children) && topic.children.length > 0;
}

/**
 * @param {object} topic
 * @returns {boolean}
 */
export function isTopicLeaf(topic) {
    return !isTopicParent(topic);
}

/**
 * @param {object} data
 * @returns {object[]}
 */
export function getLeafTopics(data) {
    const leaves = [];
    (data?.topics || []).forEach(topic => {
        if (isTopicParent(topic)) {
            topic.children.forEach(child => leaves.push(child));
        } else {
            leaves.push(topic);
        }
    });
    return leaves;
}

/**
 * @param {object} data
 * @returns {number}
 */
export function countLeafTopics(data) {
    return getLeafTopics(data).length;
}

/**
 * @param {object} data
 * @returns {number}
 */
export function countParentTopics(data) {
    return (data?.topics || []).filter(isTopicParent).length;
}

/**
 * @param {object} data
 * @returns {object[]}
 */
export function flattenQuestionsFromData(data) {
    return getLeafTopics(data).flatMap(t => t.questions || []);
}

/**
 * @param {object} data
 * @returns {number}
 */
export function countAllQuestionsInData(data) {
    return flattenQuestionsFromData(data).length;
}

/**
 * @param {object} data
 * @param {{ p: number, c: number|null }} ref
 * @returns {object|null}
 */
export function resolveTopicRef(data, ref) {
    if (!data?.topics || ref?.p == null) return null;
    const parent = data.topics[ref.p];
    if (!parent) return null;
    if (ref.c != null) return parent.children?.[ref.c] || null;
    return isTopicLeaf(parent) ? parent : null;
}

/**
 * @param {object} data
 * @param {{ p: number, c: number|null }} ref
 * @returns {string}
 */
export function getTopicDisplayTitle(data, ref) {
    const parent = data?.topics?.[ref.p];
    if (!parent) return '—';
    if (ref.c != null) {
        const child = parent.children?.[ref.c];
        return child ? `${parent.title} › ${child.title}` : parent.title;
    }
    return parent.title;
}

/**
 * @param {object} topic
 * @returns {number}
 */
export function topicQuestionCount(topic) {
    if (isTopicParent(topic)) {
        return topic.children.reduce((n, c) => n + (c.questions?.length || 0), 0);
    }
    return topic.questions?.length || 0;
}

/**
 * Chuẩn hóa cấu trúc topic sau load.
 * @param {object} data
 */
export function normalizeTopicTree(data) {
    if (!data?.topics) return;
    data.topics.forEach(topic => {
        if (isTopicParent(topic)) {
            topic.children = (topic.children || []).map(child => ({
                ...child,
                questions: child.questions || []
            }));
            delete topic.questions;
        } else {
            topic.questions = topic.questions || [];
            delete topic.children;
        }
    });
}

/**
 * Danh sách leaf kèm ref để chọn khi ôn thi.
 * @param {object} data
 * @returns {{ ref: { p: number, c: number|null }, topic: object, label: string }[]}
 */
export function listSelectableLeaves(data) {
    const items = [];
    (data?.topics || []).forEach((topic, p) => {
        if (isTopicParent(topic)) {
            topic.children.forEach((child, c) => {
                items.push({
                    ref: { p, c },
                    topic: child,
                    label: `${topic.title} › ${child.title}`
                });
            });
        } else if ((topic.questions?.length || 0) > 0) {
            items.push({ ref: { p, c: null }, topic, label: topic.title });
        }
    });
    return items;
}
