import { APP_CONFIG } from '../config/index.js';
import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';
import { $ } from '../utils/dom.js';

const THEMES = { LIGHT: 'light', DARK: 'dark' };

/**
 * Theme manager — toggles dark/light mode via data-theme attribute.
 */
export const ThemeManager = {
    /**
     * Initialize theme from localStorage or system preference.
     */
    init() {
        const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.THEME);
        const theme =
            saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT);
        this.setTheme(theme, false);
        this._bindToggle();
    },

    /**
     * Get current theme.
     * @returns {string}
     */
    getTheme() {
        return document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
    },

    /**
     * Set theme and persist.
     * @param {string} theme
     * @param {boolean} [emit=true]
     */
    setTheme(theme, emit = true) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.THEME, theme);
        const btn = $('btnThemeToggle');
        if (btn) {
            btn.textContent = theme === THEMES.DARK ? '☀️' : '🌙';
            btn.setAttribute('aria-label', theme === THEMES.DARK ? 'Chế độ sáng' : 'Chế độ tối');
        }
        if (emit) eventBus.emit(EVENTS.THEME_CHANGED, { theme });
    },

    /** Toggle between light and dark */
    toggle() {
        const next = this.getTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
        this.setTheme(next);
    },

    _bindToggle() {
        const btn = $('btnThemeToggle');
        if (btn) btn.addEventListener('click', () => this.toggle());
    }
};

export { THEMES };
