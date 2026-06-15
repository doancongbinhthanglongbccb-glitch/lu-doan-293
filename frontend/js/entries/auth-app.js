import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { AuthPages } from '../features/auth/auth-pages.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';

migrateLegacyStorageKeys();
initApiLoadingBridge();

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.authPage;
    if (page === 'login') AuthPages.initLogin();
    if (page === 'register') AuthPages.initRegister();
});
