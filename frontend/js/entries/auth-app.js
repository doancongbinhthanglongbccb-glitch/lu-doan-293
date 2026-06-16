import { migrateLegacyStorageKeys } from '../storage/migrate-legacy-keys.js';
import { AuthPages } from '../features/auth/auth-pages.js';
import { initApiLoadingBridge } from '../ui/api-loading-bridge.js';

migrateLegacyStorageKeys();
initApiLoadingBridge();

document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.authPage;
    try {
        if (page === 'login') await AuthPages.initLogin();
        if (page === 'register') await AuthPages.initRegister();
    } catch (err) {
        console.error('[auth-app] init failed:', err);
    }
});
