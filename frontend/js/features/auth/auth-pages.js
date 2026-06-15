import { auth } from '../../services/auth/index.js';

/**
 * Login and register page logic.
 */
export const AuthPages = {
    /**
     * Initialize login page.
     */
    async initLogin() {
        await auth.initUsers();
        if (auth.isLoggedIn()) {
            window.location.href = auth.isAdmin() ? 'admin.html' : 'index.html';
            return;
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

            window.location.href = result.user.role === 'admin' ? 'admin.html' : 'index.html';
        });
    },

    /**
     * Initialize register page.
     */
    initRegister() {
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
            const password = document.getElementById('password').value;
            const passwordConfirm = document.getElementById('passwordConfirm').value;

            if (password !== passwordConfirm) {
                errEl.textContent = 'Mật khẩu xác nhận không khớp.';
                errEl.style.display = 'block';
                return;
            }

            const result = await auth.register(militaryId, fullName, password);
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
