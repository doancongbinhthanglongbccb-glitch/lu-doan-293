import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitTopicQuestionSets } from '../src/services/topic-review.service.js';

describe('topic review deterministic sets', () => {
    it('pool chia hết K: 50 câu, K=25 => N=2', () => {
        const ids = Array.from({ length: 50 }, (_, i) => i + 1);
        const sets = splitTopicQuestionSets(ids, 25);
        assert.equal(sets.length, 2);
        assert.equal(sets[0].length, 25);
        assert.equal(sets[1].length, 25);
        assert.deepEqual(sets[0][0], 1);
        assert.deepEqual(sets[1][0], 26);
    });

    it('pool dư: 36 câu, K=25 => N=2, bộ 2 có 11 câu', () => {
        const ids = Array.from({ length: 36 }, (_, i) => i + 1);
        const sets = splitTopicQuestionSets(ids, 25);
        assert.equal(sets.length, 2);
        assert.equal(sets[0].length, 25);
        assert.equal(sets[1].length, 11);
        assert.deepEqual(sets[1][0], 26);
    });

    it('pool nhỏ hơn K: N=1, không rỗng, không lỗi', () => {
        const ids = [101, 102, 103];
        const sets = splitTopicQuestionSets(ids, 25);
        assert.equal(sets.length, 1);
        assert.equal(sets[0].length, 3);
        assert.deepEqual(sets[0], ids);
    });
});
