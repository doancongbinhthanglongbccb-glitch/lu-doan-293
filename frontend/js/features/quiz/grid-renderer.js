import { VIRTUAL_SCROLL_THRESHOLD, VIRTUAL_SCROLL_WINDOW } from '../../config/index.js';
import { $ } from '../../utils/dom.js';
import { hasAnswer } from '../../core/grading.js';

/**
 * Render question navigation grid with optional virtual scrolling.
 */
export class GridRenderer {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
        this.totalCount = 0;
        this.currentIndex = 0;
        /** @type {Record<number, object>} */
        this.answers = {};
        /** @type {Function|null} */
        this.onNavigate = null;
        this._useVirtual = false;
        this._scrollOffset = 0;
    }

    /**
     * Build grid for all questions.
     * @param {number} totalCount
     * @param {Function} onNavigate - Called with question index
     */
    build(totalCount, onNavigate) {
        this.totalCount = totalCount;
        this.onNavigate = onNavigate;
        this._useVirtual = totalCount > VIRTUAL_SCROLL_THRESHOLD;
        this._scrollOffset = 0;
        this.container.innerHTML = '';

        if (this._useVirtual) {
            this.container.classList.add('grid-virtual');
            this._renderVirtualWindow();
            this.container.addEventListener('scroll', () => this._onScroll());
        } else {
            this.container.classList.remove('grid-virtual');
            for (let i = 0; i < totalCount; i++) {
                this.container.appendChild(this._createItem(i));
            }
        }
        this.update();
    }

    /**
     * Update grid item states and progress display.
     * @param {number} [currentIndex]
     * @param {Record<number, object>} [answers]
     * @param {Object} [progressEls]
     * @param {HTMLElement} [progressEls.progressText]
     * @param {HTMLElement} [progressEls.percentText]
     */
    update(currentIndex, answers, progressEls) {
        if (currentIndex !== undefined) this.currentIndex = currentIndex;
        if (answers !== undefined) this.answers = answers;

        if (this._useVirtual) {
            this._renderVirtualWindow();
        }

        for (let i = 0; i < this.totalCount; i++) {
            const el = $(`gridQ${i}`);
            if (!el) continue;
            el.className = 'grid-item';
            const ans = this.answers[i];
            if (ans?.doubtful) el.classList.add('doubt');
            else if (hasAnswer(ans)) el.classList.add('done');
            if (i === this.currentIndex) el.classList.add('current');
        }

        if (progressEls) {
            let done = 0;
            for (let i = 0; i < this.totalCount; i++) {
                if (hasAnswer(this.answers[i])) done++;
            }
            if (progressEls.progressText) {
                progressEls.progressText.textContent = `${done}/${this.totalCount}`;
            }
            if (progressEls.percentText) {
                const pct = this.totalCount > 0 ? Math.round((done / this.totalCount) * 100) : 0;
                progressEls.percentText.textContent = `${pct}%`;
            }
        }
    }

    /**
     * @param {number} index
     * @returns {HTMLDivElement}
     */
    _createItem(index) {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.id = `gridQ${index}`;
        div.textContent = String(index + 1);
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.setAttribute('aria-label', `Câu ${index + 1}`);
        div.onclick = () => this.onNavigate?.(index);
        div.onkeydown = e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.onNavigate?.(index);
            }
        };
        return div;
    }

    _renderVirtualWindow() {
        const itemHeight = 36;
        const scrollTop = this.container.scrollTop;
        const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 5);
        const end = Math.min(this.totalCount, start + VIRTUAL_SCROLL_WINDOW);

        this.container.style.height = `${Math.min(this.totalCount * itemHeight, 400)}px`;
        this.container.innerHTML = '';

        const spacerTop = document.createElement('div');
        spacerTop.style.height = `${start * itemHeight}px`;
        this.container.appendChild(spacerTop);

        for (let i = start; i < end; i++) {
            const item = this._createItem(i);
            this.container.appendChild(item);
        }

        const spacerBottom = document.createElement('div');
        spacerBottom.style.height = `${(this.totalCount - end) * itemHeight}px`;
        this.container.appendChild(spacerBottom);
    }

    _onScroll() {
        this._renderVirtualWindow();
        this.update();
    }
}
