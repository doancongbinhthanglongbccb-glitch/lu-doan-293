import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { AdminController } from '../features/admin/admin-controller.js';
import { initToast } from '../ui/toast.js';
import { initLoading } from '../ui/loading.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';
import { initAuthSessionBridge } from '../services/auth/auth-session-bridge.js';

migrateLegacyStorageKeys();
initToast();
initLoading();
initApiLoadingBridge();
initAuthSessionBridge();

const controller = new AdminController();
document.addEventListener('DOMContentLoaded', () => controller.init());
