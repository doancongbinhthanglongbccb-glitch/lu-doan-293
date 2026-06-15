import { APP_CONFIG, STORAGE_PREFIX } from '../config/index.js';
import { localStorageAdapter } from './local-storage-adapter.js';
import * as quizRepo from './quiz-repository.js';
import * as userRepo from './user-repository.js';
import { downloadJSON } from './quiz-repository.js';

const BACKUP_VERSION = 2;

/**
 * Export full application backup as downloadable JSON.
 * @param {object|null} [currentUser]
 */
export function exportBackup(currentUser = null) {
    const user = currentUser || userRepo.getCurrentUser();
    const backup = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        quizData: quizRepo.getCachedQuizData(),
        usersData: userRepo.getCachedUsers(),
        wrongHistory: user ? quizRepo.getWrongHistory(user) : null,
        correctHistory: user ? quizRepo.getCorrectHistory(user) : null
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(backup, `cbquiz_backup_${date}.json`);
}

/**
 * Import backup from JSON file.
 * @param {File} file
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export function importBackup(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const backup = JSON.parse(e.target.result);
                if (!backup || typeof backup !== 'object') {
                    resolve({ ok: false, message: 'File backup không hợp lệ.' });
                    return;
                }

                if (backup.quizData) {
                    await quizRepo.saveQuizData(backup.quizData);
                }
                if (backup.usersData) {
                    userRepo.saveUsers(userRepo.normalizeUsers(backup.usersData));
                }
                const user = userRepo.getCurrentUser();
                if (user && backup.wrongHistory) {
                    quizRepo.saveWrongHistory(user, backup.wrongHistory);
                }
                if (user && backup.correctHistory) {
                    quizRepo.saveCorrectHistory(user, backup.correctHistory);
                }

                resolve({ ok: true, message: 'Khôi phục backup thành công!' });
            } catch (err) {
                resolve({ ok: false, message: 'Lỗi đọc file backup: ' + err.message });
            }
        };
        reader.onerror = () => reject(new Error('Không thể đọc file.'));
        reader.readAsText(file);
    });
}

/**
 * Clear all application data from localStorage (dangerous).
 * @returns {boolean}
 */
export function clearAllData() {
    const keys = APP_CONFIG.STORAGE_KEYS;
    Object.values(keys).forEach(key => {
        if (typeof key === 'string' && !key.endsWith('_')) {
            localStorageAdapter.remove(key);
        }
    });
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
            localStorageAdapter.remove(key);
        }
    }
    return true;
}
