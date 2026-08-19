/**
 * Chuẩn hoá payload câu hỏi trả về client: ẩn đáp án đúng, chấm 1 câu.
 */

/**
 * Bỏ isCorrect khỏi đáp án; giữ isMul để UI hiện checkbox hay radio.
 * @param {object[]} questions
 * @returns {object[]}
 */
export function stripCorrectFlags(questions) {
    return (questions || []).map(q => {
        const answers = Array.isArray(q.answers) ? q.answers : [];
        const isMul =
            q.isMul === true ||
            q.type === 'Multipleresponse' ||
            answers.filter(a => a && a.isCorrect).length > 1;
        return {
            ...q,
            isMul,
            answers: answers.map(a => {
                if (!a || typeof a !== 'object') return a;
                const { isCorrect: _drop, ...rest } = a;
                return rest;
            })
        };
    });
}

/**
 * @param {object} q
 * @param {{ selected?: number[], textValue?: string }|null} answerState
 * @returns {{ answered: boolean, isCorrect: boolean }}
 */
export function gradeQuestion(q, answerState) {
    if (!answerState) return { answered: false, isCorrect: false };
    const type = q.type || '';
    if (type === 'Fillintheblank' || type === 'essayquestion') {
        const text = String(answerState.textValue || '').trim();
        if (!text) return { answered: false, isCorrect: false };
        const cor = (q.answers || []).find(a => a.isCorrect);
        if (!cor) return { answered: true, isCorrect: false };
        const strip = html =>
            String(html || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        return { answered: true, isCorrect: strip(cor.html) === strip(text) };
    }
    const selected = Array.isArray(answerState.selected) ? [...answerState.selected].sort() : [];
    if (!selected.length) return { answered: false, isCorrect: false };
    const corIdx = (q.answers || [])
        .map((a, j) => (a.isCorrect ? j : -1))
        .filter(j => j !== -1)
        .sort((a, b) => a - b);
    return { answered: true, isCorrect: JSON.stringify(selected) === JSON.stringify(corIdx) };
}

/**
 * Nội dung giải thích khi trả lời sai — không dùng key isCorrect.
 * @param {object} q
 * @returns {{ correctIndexes: number[], html: string }}
 */
export function practiceExplanation(q) {
    const type = q.type || '';
    if (type === 'Fillintheblank' || type === 'essayquestion') {
        const cor = (q.answers || []).find(a => a && a.isCorrect);
        return { correctIndexes: [], html: cor ? String(cor.html || '') : '' };
    }
    const correctIndexes = [];
    const parts = [];
    (q.answers || []).forEach((a, i) => {
        if (!a || !a.isCorrect) return;
        correctIndexes.push(i);
        const letter = a.letter ? `<strong>${a.letter}.</strong> ` : '';
        parts.push(`<div>${letter}${a.html || ''}</div>`);
    });
    return { correctIndexes, html: parts.join('') };
}
