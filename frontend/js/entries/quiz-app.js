import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { QuizController } from '../features/quiz/quiz-controller.js';
import { initToast } from '../ui/toast.js';
import { initLoading } from '../ui/loading.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';
import { initAuthSessionBridge } from '../services/auth/auth-session-bridge.js';

migrateLegacyStorageKeys();
initToast();
initLoading();
initApiLoadingBridge();
initAuthSessionBridge();

const controller = new QuizController();
document.addEventListener('DOMContentLoaded', () => controller.init());
