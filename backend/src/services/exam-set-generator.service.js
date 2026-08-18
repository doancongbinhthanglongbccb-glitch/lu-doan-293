/**
 * Engine sinh bộ đề — random, ngưỡng trùng ≤ 50%, không chặn pool nhỏ.
 */

const DEFAULT_MAX_RETRIES = 100;

/**
 * @param {number[]} arr
 * @param {() => number} rng
 * @returns {number[]}
 */
function shuffleArray(arr, rng) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Tỉ lệ câu trùng = |A ∩ B| / |A| (cùng độ dài bộ thì đối xứng).
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function overlapRatio(a, b) {
    if (!a.length) return 0;
    const other = new Set(b);
    let shared = 0;
    for (const id of a) {
        if (other.has(id)) shared += 1;
    }
    return shared / a.length;
}

function overlapsTooMuch(candidate, prevSets) {
    return prevSets.some(prev => overlapRatio(candidate, prev) > 0.5);
}

/**
 * Bốc ngẫu nhiên `size` câu, không lặp trong bộ; xáo thứ tự kết quả.
 * @param {number[]} pool
 * @param {number} size
 * @param {() => number} rng
 * @returns {number[]}
 */
function buildOneSet(pool, size, rng) {
    const shuffled = shuffleArray(pool, rng);
    return shuffleArray(shuffled.slice(0, size), rng);
}

/**
 * Sinh N bộ đề từ pool.
 * Pool nhỏ hơn questionsPerSet → vẫn tạo bộ với số câu = pool.length.
 *
 * @param {number[]} pool
 * @param {number} questionsPerSet
 * @param {number} numberOfSets
 * @param {{ maxRetries?: number, rng?: () => number }} [options]
 * @returns {{ ok: true, sets: number[][] } | { ok: false, error: string, sets: number[][] }}
 */
export function generateExamSets(pool, questionsPerSet, numberOfSets, options = {}) {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const rng = options.rng ?? Math.random;

    if (!Array.isArray(pool) || pool.length === 0) {
        return {
            ok: false,
            error: 'Pool câu hỏi trống.',
            sets: []
        };
    }

    const perSet = Number(questionsPerSet);
    const numSets = Number(numberOfSets);

    if (!Number.isInteger(perSet) || perSet < 1 || !Number.isInteger(numSets) || numSets < 1) {
        return {
            ok: false,
            error: 'questionsPerSet và numberOfSets phải là số nguyên dương.',
            sets: []
        };
    }

    const size = Math.min(perSet, pool.length);
    const uniquePool = [...new Set(pool)];
    const sets = [];

    for (let s = 0; s < numSets; s++) {
        let accepted = null;
        let fallback = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const candidate = buildOneSet(uniquePool, size, rng);
            fallback = candidate;
            if (overlapsTooMuch(candidate, sets)) continue;
            accepted = candidate;
            break;
        }

        sets.push(accepted || fallback);
    }

    return { ok: true, sets };
}
