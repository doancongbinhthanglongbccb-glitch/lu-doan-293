import { auth } from '../../services/auth/index.js';
import { ROUTES } from '../../config/index.js';
import { clearLocalSession } from '../../services/auth/session-store.js';
import { TokenManager } from '../../services/auth/token-manager.js';
import { apiClient } from '../../services/api/api-client.js';
import { pickBattalions } from '../../services/api/api-response.js';

/**
 * Login and register page logic.
 */
export const AuthPages = {
    /**
     * Initialize login page.
     */
    async initLogin() {
        const user = await auth.ensureSession();
        if (user && auth.isLoggedIn()) {
            window.location.href = auth.isAdmin() ? ROUTES.ADMIN : ROUTES.QUIZ;
            return;
        }

        if (!TokenManager.getToken() && auth.getCurrentUser()) {
            clearLocalSession();
        }

        const form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const militaryId = document.getElementById('militaryId').value.trim();
            const password = document.getElementById('password').value;
            const errEl = document.getElementById('loginError');

            const result = await auth.login(militaryId, password);
            if (!result.ok) {
                errEl.textContent = result.message;
                errEl.style.display = 'block';
                return;
            }

            window.location.href = result.user.role === 'admin' ? ROUTES.ADMIN : ROUTES.QUIZ;
        });
    },

    /**
     * Initialize register page.
     */
    async initRegister() {
        const user = await auth.ensureSession();
        if (user && auth.isLoggedIn()) {
            window.location.href = auth.isAdmin() ? ROUTES.ADMIN : ROUTES.QUIZ;
            return;
        }

        if (!TokenManager.getToken() && auth.getCurrentUser()) {
            clearLocalSession();
        }

        const battalionSelect = document.getElementById('battalionId');
        if (battalionSelect) {
            try {
                const { data } = await apiClient.get('/auth/battalions', { skipAuth: true, silent: true });
                const battalions = pickBattalions(data) || [];
                battalions.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = String(b.id);
                    opt.textContent = b.name;
                    battalionSelect.appendChild(opt);
                });
                if (!battalions.length) {
                    battalionSelect.innerHTML =
                        '<option value="">— Chưa có tiểu đoàn —</option>';
                    battalionSelect.disabled = true;
                }
            } catch {
                battalionSelect.innerHTML =
                    '<option value="">— Không tải được danh sách —</option>';
                battalionSelect.disabled = true;
            }
        }

        const form = document.getElementById('registerForm');
        if (!form) return;

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const errEl = document.getElementById('registerError');
            const okEl = document.getElementById('registerSuccess');
            errEl.style.display = 'none';
            okEl.style.display = 'none';

            const militaryId = document.getElementById('militaryId').value.trim();
            const fullName = document.getElementById('fullName').value.trim();
            const battalionId = document.getElementById('battalionId').value;
            const password = document.getElementById('password').value;
            const passwordConfirm = document.getElementById('passwordConfirm').value;

            if (!battalionId) {
                errEl.textContent = 'Vui lòng chọn tiểu đoàn.';
                errEl.style.display = 'block';
                return;
            }

            if (password !== passwordConfirm) {
                errEl.textContent = 'Mật khẩu xác nhận không khớp.';
                errEl.style.display = 'block';
                return;
            }

            const result = await auth.register(militaryId, fullName, password, battalionId);
            if (!result.ok) {
                errEl.textContent = result.message;
                errEl.style.display = 'block';
                return;
            }

            okEl.textContent = result.message;
            okEl.style.display = 'block';
            form.reset();
        });
    }
};
