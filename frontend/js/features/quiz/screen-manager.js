import { $ } from '../../utils/dom.js';

/** @type {Record<string, HTMLElement|null>} */
const screens = {};

/**
 * Cache and manage quiz screen visibility.
 */
export const ScreenManager = {
    /**
     * Initialize screen references.
     * @param {string[]} screenIds
     */
    init(screenIds) {
        screenIds.forEach(id => {
            screens[id] = $(id);
        });
    },

    /**
     * Show a screen by ID.
     * @param {string} screenId
     * @param {Object} [options]
     * @param {HTMLElement|null} [options.exitBtn]
     * @param {string[]} [options.hideExitOn]
     */
    show(screenId, { exitBtn, hideExitOn = ['screenHome', 'screenSetup', 'screenSetupWrong'] } = {}) {
        Object.values(screens).forEach(el => el?.classList.remove('active'));
        const target = screens[screenId] || $(screenId);
        if (target) target.classList.add('active');

        if (exitBtn) {
            exitBtn.style.display = hideExitOn.includes(screenId) ? 'none' : 'flex';
        }
    },

    /**
     * Get currently active screen ID.
     * @returns {string}
     */
    getActiveId() {
        const active = document.querySelector('.screen.active');
        return active?.id || '';
    }
};
