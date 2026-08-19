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
    return getLeafTopics(data).reduce(
        (n, t) => n + (t.questions?.length || t.questionCount || 0),
        0
    );
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
 * Chuẩn hóa tên chủ đề để so trùng:
 * - không phân biệt hoa/thường
 * - gạch ngang các loại (—, –, −, -…) coi như nhau
 * - khoảng trắng quanh gạch bị bỏ qua
 * - gạch và khoảng trắng đều là cùng một dấu phân cách (vd. "Quân sự" ≡ "Quân-sự" ≡ "Quân - Sự")
 * @param {string} title
 * @returns {string}
 */
export function normalizeTopicTitleKey(title) {
    return String(title || '')
        .normalize('NFC')
        .toLowerCase()
        .trim()
        // Mọi loại gạch + khoảng trắng → một khoảng trắng duy nhất
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D\u30FC\-–—―\s]+/g, ' ')
        .trim();
}

/**
 * Tìm chủ đề trùng tên (theo normalizeTopicTitleKey) trong cùng phạm vi anh em.
 * @param {object} data
 * @param {string} title
 * @param {Object} [options]
 * @param {'root'|'children'} [options.scope='root']
 * @param {number} [options.parentIndex] - bắt buộc khi scope=children
 * @param {{ p: number, c: number|null }|null} [options.excludeRef] - bỏ qua khi sửa
 * @returns {{ title: string, ref: { p: number, c: number|null } }|null}
 */
export function findTopicTitleConflict(data, title, options = {}) {
    const key = normalizeTopicTitleKey(title);
    if (!key) return null;

    const { scope = 'root', parentIndex = null, excludeRef = null } = options;
    const topics = data?.topics || [];

    const isExcluded = (p, c) =>
        excludeRef &&
        excludeRef.p === p &&
        (excludeRef.c ?? null) === (c ?? null);

    if (scope === 'children') {
        const parent = topics[parentIndex];
        if (!parent?.children) return null;
        for (let c = 0; c < parent.children.length; c++) {
            if (isExcluded(parentIndex, c)) continue;
            const child = parent.children[c];
            if (normalizeTopicTitleKey(child.title) === key) {
                return { title: child.title, ref: { p: parentIndex, c } };
            }
        }
        return null;
    }

    for (let p = 0; p < topics.length; p++) {
        if (isExcluded(p, null)) continue;
        const topic = topics[p];
        if (normalizeTopicTitleKey(topic.title) === key) {
            return { title: topic.title, ref: { p, c: null } };
        }
    }
    return null;
}

/**
 * @param {object} topic
 * @returns {number}
 */
export function topicQuestionCount(topic) {
    if (isTopicParent(topic)) {
        return topic.children.reduce(
            (n, c) => n + (c.questions?.length || c.questionCount || 0),
            0
        );
    }
    return topic.questions?.length || topic.questionCount || 0;
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
        } else if ((topic.questions?.length || topic.questionCount || 0) > 0) {
            items.push({ ref: { p, c: null }, topic, label: topic.title });
        }
    });
    return items;
}

/**
 * Payload admin: trùng id hoặc con.id === cha.id sẽ tạo vòng khi lưu.
 * @param {object[]} topics
 * @returns {boolean}
 */
export function quizPayloadWouldCycle(topics) {
    const ids = [];
    for (const topic of topics || []) {
        if (topic.id != null) ids.push(Number(topic.id));
        for (const child of topic.children || []) {
            if (child.id == null) continue;
            const cid = Number(child.id);
            if (topic.id != null && cid === Number(topic.id)) return true;
            ids.push(cid);
        }
    }
    return new Set(ids).size !== ids.length;
}
