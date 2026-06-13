/**
 * Quản lý dữ liệu: LocalStorage + load/save JSON
 */
const TSQCB_Storage = {
    /** Chuẩn hóa cấu trúc dữ liệu topics */
    normalizeData(data) {
        if (!data) return { title: TSQCB_CONFIG.APP_NAME, topics: [] };

        if (!data.topics || data.topics.length === 0) {
            data.topics = [{
                title: 'Mặc định',
                questions: data.questions || []
            }];
        }

        data.topics.forEach(topic => {
            (topic.questions || []).forEach(q => {
                q.hash = TSQCB_Utils.hashStr(q.contentHtml);
                if (!q.type) q.type = 'multiplechoice';
                if (!q.answers) q.answers = [];
            });
        });

        return data;
    },

    /** Lấy dữ liệu từ localStorage (admin đã chỉnh sửa) */
    getLocalData() {
        try {
            const raw = localStorage.getItem(TSQCB_CONFIG.STORAGE_KEYS.QUIZ_DATA);
            return raw ? this.normalizeData(JSON.parse(raw)) : null;
        } catch {
            return null;
        }
    },

    /** Lưu dữ liệu vào localStorage */
    saveLocalData(data) {
        const normalized = this.normalizeData(TSQCB_Utils.clone(data));
        localStorage.setItem(TSQCB_CONFIG.STORAGE_KEYS.QUIZ_DATA, JSON.stringify(normalized));
        return normalized;
    },

    /** Tải dữ liệu từ file JSON mặc định */
    async fetchDefaultData() {
        const res = await fetch(TSQCB_CONFIG.DATA_URL);
        if (!res.ok) throw new Error('Không thể tải data/questions.json');
        const data = await res.json();
        return this.normalizeData(data);
    },

    /** Load dữ liệu: ưu tiên localStorage, fallback fetch JSON */
    async loadQuizData() {
        const local = this.getLocalData();
        if (local && local.topics && local.topics.length > 0) {
            return local;
        }
        try {
            return await this.fetchDefaultData();
        } catch (err) {
            console.warn('Fetch JSON thất bại, thử localStorage:', err);
            if (local) return local;
            throw new Error('Không có dữ liệu câu hỏi. Vui lòng đăng nhập Admin để import dữ liệu.');
        }
    },

    /** Export JSON file download */
    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'questions.json';
        a.click();
        URL.revokeObjectURL(url);
    },

    /** ——— Quản lý users ——— */
    getLocalUsers() {
        try {
            const raw = localStorage.getItem(TSQCB_CONFIG.STORAGE_KEYS.USERS_DATA);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    saveUsers(data) {
        localStorage.setItem(TSQCB_CONFIG.STORAGE_KEYS.USERS_DATA, JSON.stringify(data));
    },

    normalizeUsers(data) {
        if (!data || !Array.isArray(data.users)) {
            data = { users: [] };
        }
        const admin = TSQCB_CONFIG.DEFAULT_ADMIN;
        const hasAdmin = data.users.some(u => u.militaryId === admin.militaryId);
        if (!hasAdmin) {
            data.users.unshift({
                ...admin,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        return data;
    },

    async fetchDefaultUsers() {
        const res = await fetch(TSQCB_CONFIG.USERS_URL);
        if (!res.ok) throw new Error('Không thể tải data/users.json');
        return this.normalizeUsers(await res.json());
    },

    async loadUsers() {
        const local = this.getLocalUsers();
        if (local && local.users && local.users.length > 0) {
            return this.normalizeUsers(local);
        }
        try {
            const data = await this.fetchDefaultUsers();
            this.saveUsers(data);
            return data;
        } catch {
            const fallback = this.normalizeUsers({ users: [] });
            this.saveUsers(fallback);
            return fallback;
        }
    },

    _userHistoryId(user) {
        if (!user || user.role === 'admin') return null;
        return user.militaryId || user.username || null;
    },

    /** Lấy lịch sử câu sai */
    getWrongHistory(user) {
        const uid = this._userHistoryId(user);
        const userKey = uid
            ? TSQCB_CONFIG.STORAGE_KEYS.WRONG_HISTORY_PREFIX + uid
            : TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_WRONG;
        try {
            let history = JSON.parse(localStorage.getItem(userKey) || '{}');
            if (uid && Object.keys(history).length === 0) {
                const global = JSON.parse(localStorage.getItem(TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_WRONG) || '{}');
                if (Object.keys(global).length > 0) {
                    history = global;
                    localStorage.setItem(userKey, JSON.stringify(history));
                }
            }
            return history;
        } catch {
            return {};
        }
    },

    /** Lưu lịch sử câu sai */
    saveWrongHistory(user, history) {
        const uid = this._userHistoryId(user);
        const key = uid
            ? TSQCB_CONFIG.STORAGE_KEYS.WRONG_HISTORY_PREFIX + uid
            : TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_WRONG;
        localStorage.setItem(key, JSON.stringify(history));
    },

    /** Lấy lịch sử câu đúng (dùng cho ôn câu sai) */
    getCorrectHistory(user) {
        const uid = this._userHistoryId(user);
        const userKey = uid
            ? TSQCB_CONFIG.STORAGE_KEYS.CORRECT_HISTORY_PREFIX + uid
            : TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_CORRECT;
        try {
            let history = JSON.parse(localStorage.getItem(userKey) || '{}');
            if (uid && Object.keys(history).length === 0) {
                const global = JSON.parse(localStorage.getItem(TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_CORRECT) || '{}');
                if (Object.keys(global).length > 0) {
                    history = global;
                    localStorage.setItem(userKey, JSON.stringify(history));
                }
            }
            return history;
        } catch {
            return {};
        }
    },

    /** Lưu lịch sử câu đúng */
    saveCorrectHistory(user, history) {
        const uid = this._userHistoryId(user);
        const key = uid
            ? TSQCB_CONFIG.STORAGE_KEYS.CORRECT_HISTORY_PREFIX + uid
            : TSQCB_CONFIG.STORAGE_KEYS.GLOBAL_CORRECT;
        localStorage.setItem(key, JSON.stringify(history));
    }
};
