import * as quizModel from '../models/quiz.model.js';
import * as progressModel from '../models/practice-topic-progress.model.js';
import { stripCorrectFlags } from '../utils/question-payload.js';

function err(message, status = 400) {
    const e = new Error(message);
    e.status = status;
    return e;
}

/**
 * Chia danh sách id theo bộ cố định (thứ tự tăng dần, không random).
 * @param {number[]} questionIds
 * @param {number} perSet
 * @returns {number[][]}
 */
export function splitTopicQuestionSets(questionIds, perSet) {
    const ids = Array.isArray(questionIds) ? questionIds : [];
    if (!ids.length) return [];
    const size = Math.max(1, Number(perSet) || 1);
    const sets = [];
    for (let i = 0; i < ids.length; i += size) {
        const chunk = ids.slice(i, i + size);
        if (chunk.length) sets.push(chunk);
    }
    return sets;
}

function getPerSetCount() {
    const settings = quizModel.getQuizSettings();
    return settings.sharedQuestionCount || settings.practiceMixedQuestionCount || 30;
}

function getLeafTopicOrThrow(topicId) {
    const topic = quizModel.findLeafTopicById(topicId);
    if (!topic) throw err('Không tìm thấy nội dung ôn tập.', 404);
    return topic;
}

function getTopicSets(topicId) {
    const ids = quizModel.getQuestionIdsByLeafTopic(topicId);
    return splitTopicQuestionSets(ids, getPerSetCount());
}

export function listSetsForUser(userId, topicId) {
    const topic = getLeafTopicOrThrow(topicId);
    const sets = getTopicSets(topicId);
    const progress = progressModel.getAnsweredMapByTopic(userId, topicId);
    return {
        topic: {
            id: topic.id,
            title: topic.title,
            parentTitle: topic.parent_title ?? null
        },
        setCount: sets.length,
        sets: sets.map((questionIds, i) => {
            const setIndex = i + 1;
            const answered = new Set(progress.get(setIndex) || []);
            const answeredCount = questionIds.filter(id => answered.has(id)).length;
            return {
                setIndex,
                total: questionIds.length,
                answered: answeredCount
            };
        })
    };
}

export function getSetQuestions(topicId, setIndex) {
    const topic = getLeafTopicOrThrow(topicId);
    const index = Number(setIndex);
    if (!Number.isInteger(index) || index < 1) throw err('Bộ đề không hợp lệ.');
    const sets = getTopicSets(topicId);
    const questionIds = sets[index - 1];
    if (!questionIds?.length) throw err('Không tìm thấy bộ đề.', 404);
    const questions = stripCorrectFlags(quizModel.getQuestionsByDbIds(questionIds));
    if (!questions.length) throw err('Bộ ôn tập không còn câu hỏi hợp lệ.');
    return {
        topicId: topic.id,
        setIndex: index,
        title: `Ôn tập từng phần — ${topic.parent_title ? `${topic.parent_title} › ` : ''}${topic.title} — Bộ ${index}`,
        questions
    };
}

export function recordProgress(userId, topicId, setIndex, questionIds) {
    const topic = getLeafTopicOrThrow(topicId);
    const index = Number(setIndex);
    if (!Number.isInteger(index) || index < 1) throw err('Bộ đề không hợp lệ.');
    const sets = getTopicSets(topicId);
    const allowedList = sets[index - 1];
    if (!allowedList?.length) throw err('Không tìm thấy bộ đề.', 404);
    const allowed = new Set(allowedList);
    const incoming = (questionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && allowed.has(n));
    const merged = new Set(progressModel.getAnsweredIds(userId, topicId, index));
    incoming.forEach(id => merged.add(id));
    const answeredIds = [...merged];
    progressModel.upsertAnsweredIds(userId, topicId, index, answeredIds);
    return {
        topicId: topic.id,
        setIndex: index,
        total: allowed.size,
        answered: answeredIds.length
    };
}
