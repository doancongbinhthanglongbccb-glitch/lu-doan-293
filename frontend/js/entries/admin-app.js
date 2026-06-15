import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { AdminController } from '../features/admin/admin-controller.js';
import { initToast } from '../ui/toast.js';
import { initLoading } from '../ui/loading.js';
import { ThemeManager } from '../ui/theme-manager.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';

migrateLegacyStorageKeys();
initToast();
initLoading();
initApiLoadingBridge();
ThemeManager.init();

const controller = new AdminController();
document.addEventListener('DOMContentLoaded', () => controller.init());
