/** @type {Array<Function>} */
const requestInterceptors = [];

/** @type {Array<Function>} */
const responseInterceptors = [];

/** @type {Array<Function>} */
const errorInterceptors = [];

/**
 * Register a request interceptor.
 * @param {Function} fn - (config) => config | Promise<config>
 */
export function addRequestInterceptor(fn) {
    requestInterceptors.push(fn);
}

/**
 * Register a response interceptor.
 * @param {Function} fn - (response, config) => response | Promise<response>
 */
export function addResponseInterceptor(fn) {
    responseInterceptors.push(fn);
}

/**
 * Register an error interceptor.
 * @param {Function} fn - (error, config) => void | Promise<void>
 */
export function addErrorInterceptor(fn) {
    errorInterceptors.push(fn);
}

/**
 * Run all request interceptors in sequence.
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function runRequestInterceptors(config) {
    let current = { ...config };
    for (const fn of requestInterceptors) {
        current = await fn(current);
    }
    return current;
}

/**
 * Run all response interceptors in sequence.
 * @param {object} response
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function runResponseInterceptors(response, config) {
    let current = response;
    for (const fn of responseInterceptors) {
        current = await fn(current, config);
    }
    return current;
}

/**
 * Run all error interceptors.
 * @param {Error} error
 * @param {object} config
 */
export async function runErrorInterceptors(error, config) {
    for (const fn of errorInterceptors) {
        await fn(error, config);
    }
}
