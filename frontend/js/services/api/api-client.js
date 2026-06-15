import { APP_CONFIG, EVENTS } from '../../config/index.js';
import { eventBus } from '../../core/event-bus.js';
import { TokenManager } from '../auth/token-manager.js';
import {
    mapHttpStatusToMessage,
    isNetworkError,
    createApiError
} from './api-errors.js';
import {
    runRequestInterceptors,
    runResponseInterceptors,
    runErrorInterceptors,
    addRequestInterceptor,
    addResponseInterceptor,
    addErrorInterceptor
} from './api-interceptor.js';

/** @type {Promise<void>|null} */
let refreshPromise = null;

addRequestInterceptor(async config => {
    if (!config.skipAuth) {
        const token = TokenManager.getToken();
        if (token) {
            config.headers = {
                ...config.headers,
                Authorization: `Bearer ${token}`
            };
        }
    }
    return config;
});

addResponseInterceptor(async (response, config) => {
    if (response.status === 401 && !config._retriedAfterRefresh && !config.skipAuth) {
        const refreshed = await _tryRefreshToken();
        if (refreshed) {
            return apiClient.request(config.method, config.path, {
                ...config,
                _retriedAfterRefresh: true
            });
        }
        TokenManager.removeToken();
    }
    return response;
});

addErrorInterceptor(async error => {
    if (isNetworkError(error)) {
        eventBus.emit(EVENTS.NETWORK_ERROR, { error });
        eventBus.emit(EVENTS.UI_TOAST, {
            message: 'Mất kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
            type: 'error'
        });
    }
});

/**
 * @returns {Promise<boolean>}
 */
async function _tryRefreshToken() {
    const refreshToken = TokenManager.getRefreshToken();
    if (!refreshToken) return false;

    if (refreshPromise) {
        await refreshPromise;
        return TokenManager.hasValidToken();
    }

    refreshPromise = (async () => {
        try {
            const url = `${APP_CONFIG.API_BASE_URL}/auth/refresh`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            if (!res.ok) return;
            const data = await res.json();
            TokenManager.setTokens(data);
        } catch {
            /* refresh failed */
        } finally {
            refreshPromise = null;
        }
    })();

    await refreshPromise;
    return TokenManager.hasValidToken();
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * HTTP client with interceptors, retry, timeout, and JWT support.
 */
export const apiClient = {
    /**
     * @param {string} method
     * @param {string} path
     * @param {Object} [options]
     * @returns {Promise<{ data: *, status: number, ok: boolean }>}
     */
    async request(method, path, options = {}) {
        const {
            body,
            headers = {},
            skipAuth = false,
            retries = APP_CONFIG.API_RETRIES,
            timeout = APP_CONFIG.API_TIMEOUT,
            silent = false,
            _retriedAfterRefresh = false
        } = options;

        const config = await runRequestInterceptors({
            method: method.toUpperCase(),
            path,
            body,
            headers: { ...headers },
            skipAuth,
            retries,
            timeout,
            silent,
            _retriedAfterRefresh
        });

        const url = path.startsWith('http') ? path : `${APP_CONFIG.API_BASE_URL}${path}`;

        if (!config.silent) {
            eventBus.emit(EVENTS.API_REQUEST_START, { method: config.method, path });
        }

        let lastError;

        for (let attempt = 0; attempt <= config.retries; attempt++) {
            try {
                const isFormData = body instanceof FormData;
                const fetchHeaders = { ...config.headers };
                let fetchBody = body;

                if (body !== undefined && body !== null && !isFormData) {
                    fetchHeaders['Content-Type'] = fetchHeaders['Content-Type'] || 'application/json';
                    fetchBody = JSON.stringify(body);
                }

                let response = await fetchWithTimeout(
                    url,
                    { method: config.method, headers: fetchHeaders, body: fetchBody },
                    config.timeout
                );

                response = await runResponseInterceptors(response, config);

                const contentType = response.headers.get('content-type') || '';
                let data = null;
                if (contentType.includes('application/json')) {
                    data = await response.json().catch(() => null);
                } else if (response.status !== 204) {
                    data = await response.text().catch(() => null);
                }

                if (!response.ok) {
                    const message = mapHttpStatusToMessage(
                        response.status,
                        data?.message || data?.error
                    );
                    const err = createApiError(message, { status: response.status, data });
                    await runErrorInterceptors(err, config);
                    throw err;
                }

                if (!config.silent) {
                    eventBus.emit(EVENTS.API_REQUEST_END, { method: config.method, path, ok: true });
                }

                return { data, status: response.status, ok: true };
            } catch (err) {
                lastError = err;
                const retryable = isNetworkError(err) || err.status >= 500;
                if (attempt < config.retries && retryable) {
                    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    continue;
                }
                await runErrorInterceptors(err, config);
                if (!config.silent) {
                    eventBus.emit(EVENTS.API_REQUEST_END, { method: config.method, path, ok: false });
                }
                throw err;
            }
        }

        throw lastError;
    },

    get(path, options) {
        return this.request('GET', path, options);
    },

    post(path, body, options) {
        return this.request('POST', path, { ...options, body });
    },

    put(path, body, options) {
        return this.request('PUT', path, { ...options, body });
    },

    patch(path, body, options) {
        return this.request('PATCH', path, { ...options, body });
    },

    delete(path, options) {
        return this.request('DELETE', path, options);
    }
};
