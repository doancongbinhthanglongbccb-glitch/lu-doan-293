import { ApiAuthProvider } from './api-auth-provider.js';

export { AuthProvider } from './auth-provider.js';
export { ApiAuthProvider } from './api-auth-provider.js';
export { TokenManager } from './token-manager.js';

/** Singleton auth service — API + JWT */
export const auth = new ApiAuthProvider();
