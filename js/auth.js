/**
 * Xác thực, đăng ký và quản lý người dùng
 */
const TSQCB_Auth = {
    _usersCache: null,

    /** Khởi tạo / tải danh sách user */
    async initUsers() {
        if (this._usersCache) return this._usersCache;
        this._usersCache = await TSQCB_Storage.loadUsers();
        return this._usersCache;
    },

    getUsers() {
        return this._usersCache ? this._usersCache.users : [];
    },

    _saveUsers() {
        TSQCB_Storage.saveUsers(this._usersCache);
    },

    _findUser(militaryId) {
        const id = String(militaryId || '').trim();
        return this.getUsers().find(u => u.militaryId === id) || null;
    },

    /** Kiểm tra số quân nhân hợp lệ (8 chữ số) */
    isValidMilitaryId(militaryId) {
        return /^\d{8}$/.test(String(militaryId || '').trim());
    },

    /** Đăng ký tài khoản mới — status pending */
    async register(militaryId, fullName, password) {
        await this.initUsers();
        militaryId = String(militaryId).trim();
        fullName = String(fullName).trim();

        if (!this.isValidMilitaryId(militaryId)) {
            return { ok: false, message: 'Số quân nhân phải đúng 8 chữ số.' };
        }
        if (!fullName) {
            return { ok: false, message: 'Vui lòng nhập họ và tên.' };
        }
        if (!password || password.length < 4) {
            return { ok: false, message: 'Mật khẩu phải có ít nhất 4 ký tự.' };
        }
        if (this._findUser(militaryId)) {
            return { ok: false, message: 'Số quân nhân đã được đăng ký.' };
        }

        const now = new Date().toISOString();
        this._usersCache.users.push({
            militaryId,
            fullName,
            password,
            role: 'user',
            status: TSQCB_CONFIG.USER_STATUS.PENDING,
            createdAt: now,
            updatedAt: now
        });
        this._saveUsers();
        return { ok: true, message: 'Đã gửi yêu cầu đăng ký thành công. Vui lòng chờ Admin phê duyệt.' };
    },

    /** Đăng nhập — chỉ user approved */
    async login(militaryId, password) {
        await this.initUsers();
        militaryId = String(militaryId).trim();
        const user = this._findUser(militaryId);

        if (!user || user.password !== password) {
            return { ok: false, message: 'Sai số quân nhân hoặc mật khẩu.' };
        }
        if (user.status === TSQCB_CONFIG.USER_STATUS.PENDING) {
            return { ok: false, message: 'Tài khoản đang chờ Admin phê duyệt.' };
        }
        if (user.status === TSQCB_CONFIG.USER_STATUS.REJECTED) {
            return { ok: false, message: 'Tài khoản đã bị từ chối. Liên hệ Admin để biết thêm.' };
        }
        if (user.status !== TSQCB_CONFIG.USER_STATUS.APPROVED) {
            return { ok: false, message: 'Tài khoản chưa được kích hoạt.' };
        }

        const session = {
            militaryId: user.militaryId,
            fullName: user.fullName,
            role: user.role,
            status: user.status,
            loginAt: new Date().toISOString()
        };
        localStorage.setItem(TSQCB_CONFIG.STORAGE_KEYS.CURRENT_USER, JSON.stringify(session));
        return { ok: true, user: session };
    },

    logout() {
        localStorage.removeItem(TSQCB_CONFIG.STORAGE_KEYS.CURRENT_USER);
    },

    getCurrentUser() {
        try {
            const raw = localStorage.getItem(TSQCB_CONFIG.STORAGE_KEYS.CURRENT_USER);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    isLoggedIn() {
        return !!this.getCurrentUser();
    },

    isAdmin() {
        const user = this.getCurrentUser();
        return user && user.role === 'admin';
    },

    requireAuth(redirectTo = 'login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    },

    requireAdmin(redirectTo = 'index.html') {
        if (!this.requireAuth()) return false;
        if (!this.isAdmin()) {
            alert('Bạn không có quyền truy cập trang quản trị.');
            window.location.href = redirectTo;
            return false;
        }
        return true;
    },

    /** Lấy user id cho lịch sử làm bài */
    getUserKey(user) {
        if (!user) return 'guest';
        return user.militaryId || user.username || 'guest';
    },

    // ——— Admin: quản lý user ———

    async approveUser(militaryId) {
        await this.initUsers();
        const user = this._findUser(militaryId);
        if (!user) return { ok: false, message: 'Không tìm thấy user.' };
        user.status = TSQCB_CONFIG.USER_STATUS.APPROVED;
        user.updatedAt = new Date().toISOString();
        this._saveUsers();
        return { ok: true };
    },

    async rejectUser(militaryId) {
        await this.initUsers();
        const user = this._findUser(militaryId);
        if (!user) return { ok: false, message: 'Không tìm thấy user.' };
        if (user.role === 'admin') return { ok: false, message: 'Không thể từ chối tài khoản Admin.' };
        user.status = TSQCB_CONFIG.USER_STATUS.REJECTED;
        user.updatedAt = new Date().toISOString();
        this._saveUsers();
        return { ok: true };
    },

    async updateUser(militaryId, data) {
        await this.initUsers();
        const user = this._findUser(militaryId);
        if (!user) return { ok: false, message: 'Không tìm thấy user.' };

        if (data.fullName !== undefined) {
            const name = String(data.fullName).trim();
            if (!name) return { ok: false, message: 'Họ tên không được trống.' };
            user.fullName = name;
        }
        if (data.role !== undefined && user.role !== 'admin') {
            user.role = data.role === 'admin' ? 'admin' : 'user';
        }
        if (data.status !== undefined && user.role !== 'admin') {
            const s = data.status;
            if ([TSQCB_CONFIG.USER_STATUS.PENDING, TSQCB_CONFIG.USER_STATUS.APPROVED, TSQCB_CONFIG.USER_STATUS.REJECTED].includes(s)) {
                user.status = s;
            }
        }
        user.updatedAt = new Date().toISOString();
        this._saveUsers();
        return { ok: true };
    },

    async resetPassword(militaryId, newPassword) {
        await this.initUsers();
        const user = this._findUser(militaryId);
        if (!user) return { ok: false, message: 'Không tìm thấy user.' };
        if (!newPassword || newPassword.length < 4) {
            return { ok: false, message: 'Mật khẩu mới phải có ít nhất 4 ký tự.' };
        }
        user.password = newPassword;
        user.updatedAt = new Date().toISOString();
        this._saveUsers();
        return { ok: true };
    },

    async deleteUser(militaryId) {
        await this.initUsers();
        const user = this._findUser(militaryId);
        if (!user) return { ok: false, message: 'Không tìm thấy user.' };
        if (user.role === 'admin') {
            const adminCount = this.getUsers().filter(u => u.role === 'admin').length;
            if (adminCount <= 1) return { ok: false, message: 'Không thể xóa Admin cuối cùng.' };
        }
        const current = this.getCurrentUser();
        if (current && current.militaryId === militaryId) {
            return { ok: false, message: 'Không thể xóa tài khoản đang đăng nhập.' };
        }
        this._usersCache.users = this._usersCache.users.filter(u => u.militaryId !== militaryId);
        this._saveUsers();
        return { ok: true };
    },

    getStatusLabel(status) {
        const map = {
            pending: 'Chờ duyệt',
            approved: 'Đã duyệt',
            rejected: 'Từ chối'
        };
        return map[status] || status;
    }
};
