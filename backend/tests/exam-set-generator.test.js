import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateExamSets, overlapRatio } from '../src/services/exam-set-generator.service.js';

function fixedRng() {
    return 0;
}

describe('generateExamSets', () => {
    it('pool trống → lỗi', () => {
        const result = generateExamSets([], 5, 1, { rng: fixedRng });
        assert.equal(result.ok, false);
        assert.equal(result.sets.length, 0);
    });

    it('pool nhỏ hơn questionsPerSet → vẫn tạo bộ với đủ câu đang có', () => {
        const result = generateExamSets([1, 2], 5, 1, { rng: Math.random });
        assert.equal(result.ok, true);
        assert.equal(result.sets.length, 1);
        assert.equal(result.sets[0].length, 2);
        assert.deepEqual([...result.sets[0]].sort((a, b) => a - b), [1, 2]);
    });

    it('các bộ không trùng quá 50% khi pool đủ lớn', () => {
        const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const result = generateExamSets(pool, 4, 3, { rng: Math.random });
        assert.equal(result.ok, true);
        assert.equal(result.sets.length, 3);
        for (let i = 0; i < result.sets.length; i++) {
            for (let j = i + 1; j < result.sets.length; j++) {
                assert.ok(
                    overlapRatio(result.sets[i], result.sets[j]) <= 0.5,
                    `bộ ${i + 1} trùng bộ ${j + 1} quá 50%`
                );
            }
        }
    });

    it('thứ tự câu trong bộ không phải id tăng dần (đã xáo)', () => {
        const pool = Array.from({ length: 40 }, (_, i) => i + 1);
        const result = generateExamSets(pool, 20, 1, { rng: Math.random });
        assert.equal(result.ok, true);
        const ids = result.sets[0];
        const sorted = [...ids].sort((a, b) => a - b);
        const sameOrder = ids.every((v, i) => v === sorted[i]);
        assert.equal(sameOrder, false);
    });
});
