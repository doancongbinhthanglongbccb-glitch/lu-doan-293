/**
 * Engine sinh bộ đề kiểm tra (Giai đoạn 3.1) — hàm thuần túy, không DB/UI.
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
 * @param {number[]} a
 * @param {number[]} b
 * @returns {boolean}
 */
function setsIdentical(a, b) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.every((v, i) => v === sb[i]);
}

/**
 * Chọn một bộ: ưu tiên câu có tần suất thấp nhất trong các bộ đã tạo.
 * @param {number[]} pool
 * @param {number} questionsPerSet
 * @param {Record<number, number>} usageCounts
 * @param {() => number} rng
 * @returns {number[]}
 */
function buildOneSet(pool, questionsPerSet, usageCounts, rng) {
    const selected = [];
    const usedInSet = new Set();

    while (selected.length < questionsPerSet) {
        const candidates = pool.filter(id => !usedInSet.has(id));
        if (!candidates.length) break;

        const minUsage = Math.min(...candidates.map(id => usageCounts[id] ?? 0));
        const tier = candidates.filter(id => (usageCounts[id] ?? 0) === minUsage);
        const pick = shuffleArray(tier, rng)[0];

        selected.push(pick);
        usedInSet.add(pick);
    }

    return selected;
}

/**
 * Sinh N bộ đề từ pool câu hỏi.
 *
 * @param {number[]} pool Danh sách question id
 * @param {number} questionsPerSet Số câu / bộ
 * @param {number} numberOfSets Số bộ cần tạo
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

    if (pool.length < perSet) {
        return {
            ok: false,
            error: `Pool chỉ có ${pool.length} câu, cần ít nhất ${perSet} câu để tạo một bộ.`,
            sets: []
        };
    }

    const usageCounts = {};
    for (const id of pool) {
        usageCounts[id] = 0;
    }

    const sets = [];

    for (let s = 0; s < numSets; s++) {
        let accepted = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const candidate = buildOneSet(pool, perSet, usageCounts, rng);
            if (sets.some(prev => setsIdentical(prev, candidate))) {
                continue;
            }
            accepted = candidate;
            break;
        }

        if (!accepted) {
            return {
                ok: false,
                error: `Không thể tạo bộ ${s + 1} khác biệt hoàn toàn sau ${maxRetries} lần thử.`,
                sets
            };
        }

        sets.push(accepted);
        for (const id of accepted) {
            usageCounts[id] = (usageCounts[id] ?? 0) + 1;
        }
    }

    return { ok: true, sets };
}
