import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { QuizController } from '../features/quiz/quiz-controller.js';
import { initToast } from '../ui/toast.js';
import { initLoading } from '../ui/loading.js';
import { ThemeManager } from '../ui/theme-manager.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';

migrateLegacyStorageKeys();
initToast();
initLoading();
initApiLoadingBridge();
ThemeManager.init();

const controller = new QuizController();
document.addEventListener('DOMContentLoaded', () => controller.init());
