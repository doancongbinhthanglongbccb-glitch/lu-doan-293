/**
 * Logic trang đăng nhập / đăng ký
 */
const TSQCB_AuthPage = {
    async initLogin() {
        await TSQCB_Auth.initUsers();
        if (TSQCB_Auth.isLoggedIn()) {
            window.location.href = TSQCB_Auth.isAdmin() ? 'admin.html' : 'index.html';
            return;
        }

        const form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const militaryId = document.getElementById('militaryId').value.trim();
            const password = document.getElementById('password').value;
            const errEl = document.getElementById('loginError');

            const result = await TSQCB_Auth.login(militaryId, password);
            if (!result.ok) {
                errEl.textContent = result.message;
                errEl.style.display = 'block';
                return;
            }

            window.location.href = result.user.role === 'admin' ? 'admin.html' : 'index.html';
        });
    },

    initRegister() {
        const form = document.getElementById('registerForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
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

            const result = await TSQCB_Auth.register(militaryId, fullName, password);
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

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.authPage;
    if (page === 'login') TSQCB_AuthPage.initLogin();
    if (page === 'register') TSQCB_AuthPage.initRegister();
});
