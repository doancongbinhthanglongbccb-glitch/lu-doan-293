import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateExamSets } from '../src/services/exam-set-generator.service.js';

/** RNG cố định — luôn chọn phần tử đầu sau shuffle (deterministic cho test). */
function fixedRng() {
    return 0;
}

function setsDisjoint(a, b) {
    const setB = new Set(b);
    return a.every(id => !setB.has(id));
}

function setsIdentical(a, b) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.every((v, i) => v === sb[i]);
}

describe('generateExamSets', () => {
    it('(a) pool nhỏ hơn questionsPerSet → lỗi, không tạo bộ', () => {
        const result = generateExamSets([1, 2], 5, 1, { rng: fixedRng });

        assert.equal(result.ok, false);
        assert.equal(result.sets.length, 0);
        assert.match(result.error, /ít nhất 5 câu/);
    });

    it('(b) pool = questionsPerSet × numberOfSets → N bộ không trùng câu', () => {
        const pool = [1, 2, 3, 4, 5, 6];
        const result = generateExamSets(pool, 3, 2, { rng: fixedRng });

        assert.equal(result.ok, true);
        assert.equal(result.sets.length, 2);
        assert.equal(result.sets[0].length, 3);
        assert.equal(result.sets[1].length, 3);

        assert.ok(setsDisjoint(result.sets[0], result.sets[1]));
        assert.ok(!setsIdentical(result.sets[0], result.sets[1]));

        const allIds = [...result.sets[0], ...result.sets[1]].sort((a, b) => a - b);
        assert.deepEqual(allIds, pool);
    });

    it('(c) pool dư / không chia hết → có trùng, không có 2 bộ giống hệt, ưu tiên câu ít dùng', () => {
        const pool = [1, 2, 3, 4];
        const result = generateExamSets(pool, 3, 2, { rng: fixedRng });

        assert.equal(result.ok, true);
        assert.equal(result.sets.length, 2);
        assert.ok(!setsIdentical(result.sets[0], result.sets[1]));

        const overlap = result.sets[0].filter(id => result.sets[1].includes(id));
        assert.ok(overlap.length > 0, 'Các bộ phải có trùng khi pool không đủ chia hết');

        const unusedInSet1 = pool.filter(id => !result.sets[0].includes(id));
        assert.ok(unusedInSet1.length > 0, 'Bộ 1 không dùng hết pool');
        for (const id of unusedInSet1) {
            assert.ok(result.sets[1].includes(id), `Câu ${id} ít dùng (0 lần) phải có trong bộ 2`);
        }
    });
});
