/**
 * Unwrap API JSON body — `{ data: { ... } }` or flat `{ ... }`.
 * @param {object|null|undefined} data
 * @returns {object}
 */
export function unwrapPayload(data) {
    if (!data || typeof data !== 'object') return {};
    if (data.data != null && typeof data.data === 'object') return data.data;
    return data;
}

/**
 * Unwrap a field from API JSON — supports nested `{ data: { key } }` and flat `{ key }`.
 * @param {object|null|undefined} data
 * @param {string} key
 * @returns {*}
 */
export function pickResource(data, key) {
    if (!data || typeof data !== 'object') return undefined;
    if (data.data != null && typeof data.data === 'object' && key in data.data) {
        return data.data[key];
    }
    return data[key];
}

/**
 * @param {object|null|undefined} data
 * @returns {object|undefined}
 */
export function pickUser(data) {
    return pickResource(data, 'user');
}

/**
 * @param {object|null|undefined} data
 * @returns {object[]|undefined}
 */
export function pickUsers(data) {
    return pickResource(data, 'users');
}

/**
 * @param {object|null|undefined} data
 * @returns {object[]}
 */
export function pickRecords(data) {
    return pickResource(data, 'records') || [];
}

/**
 * @param {object|null|undefined} data
 * @returns {object|null}
 */
export function pickRecord(data) {
    return pickResource(data, 'record') ?? null;
}
