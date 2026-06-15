import { $ } from '../utils/dom.js';
import { eventBus } from '../core/event-bus.js';
import { EVENTS } from '../config/index.js';

/**
 * Centralized modal manager for confirm/alert/custom modals.
 */
export const ModalManager = {
    /**
     * Open a modal by element ID.
     * @param {string} modalId
     */
    open(modalId) {
        const modal = $(modalId);
        if (!modal) return;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        eventBus.emit(EVENTS.UI_MODAL_OPEN, { id: modalId });

        const focusable = modal.querySelector('button, [href], input, select, textarea');
        if (focusable) focusable.focus();
    },

    /**
     * Close a modal by element ID.
     * @param {string} modalId
     */
    close(modalId) {
        const modal = $(modalId);
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        eventBus.emit(EVENTS.UI_MODAL_CLOSE, { id: modalId });
    },

    /**
     * Show confirmation dialog using existing modal or native confirm fallback.
     * @param {Object} options
     * @param {string} options.title
     * @param {string} options.message
     * @param {string} [options.confirmText='Xác nhận']
     * @param {string} [options.cancelText='Hủy']
     * @param {Function} [options.onConfirm]
     * @param {Function} [options.onCancel]
     * @param {string} [options.modalId] - Use custom modal element
     */
    confirm({ title, message, confirmText: _confirmText = 'Xác nhận', cancelText: _cancelText = 'Hủy', onConfirm, onCancel, modalId }) {
        if (modalId) {
            this.open(modalId);
            return;
        }

        if (window.confirm(`${title ? title + '\n\n' : ''}${message}`)) {
            onConfirm?.();
        } else {
            onCancel?.();
        }
    },

    /**
     * Show alert — uses toast for non-blocking UX.
     * @param {string} message
     * @param {string} [title]
     */
    alert(message, title) {
        const full = title ? `${title}: ${message}` : message;
        if (window.alert) {
            window.alert(full);
        }
    },

    /**
     * Bind standard confirm/cancel buttons on a modal.
     * @param {string} modalId
     * @param {string} confirmBtnId
     * @param {string} cancelBtnId
     * @param {Function} onConfirm
     */
    bindConfirm(modalId, confirmBtnId, cancelBtnId, onConfirm) {
        const confirmBtn = $(confirmBtnId);
        const cancelBtn = $(cancelBtnId);
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.close(modalId);
                onConfirm();
            };
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => this.close(modalId);
        }
    }
};
