import * as battalionModel from '../models/battalion.model.js';

/**
 * @returns {object[]}
 */
export function listActive() {
    return battalionModel.findAll(true).map(battalionModel.toPublicBattalion);
}

/**
 * @returns {object[]}
 */
export function listAll() {
    return battalionModel.findAllWithUserCounts().map(battalionModel.toPublicBattalion);
}

/**
 * @param {string} name
 */
export function createBattalion(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        const err = new Error('Tên tiểu đoàn không được trống.');
        err.status = 400;
        throw err;
    }

    const battalion = battalionModel.create(trimmed);
    return battalionModel.toPublicBattalion(battalion);
}

/**
 * @param {number} id
 * @param {object} data
 */
export function updateBattalion(id, data) {
    const existing = battalionModel.findById(id);
    if (!existing) {
        const err = new Error('Không tìm thấy tiểu đoàn.');
        err.status = 404;
        throw err;
    }

    const fields = {};
    if (data.name !== undefined) {
        const trimmed = String(data.name).trim();
        if (!trimmed) {
            const err = new Error('Tên tiểu đoàn không được trống.');
            err.status = 400;
            throw err;
        }
        fields.name = trimmed;
    }
    if (data.isActive !== undefined) {
        fields.isActive = Boolean(data.isActive);
    }

    const updated = battalionModel.update(id, fields);
    return battalionModel.toPublicBattalion(updated);
}

/**
 * @param {number} id
 */
export function deleteBattalion(id) {
    const existing = battalionModel.findById(id);
    if (!existing) {
        const err = new Error('Không tìm thấy tiểu đoàn.');
        err.status = 404;
        throw err;
    }

    const userCount = battalionModel.countUsers(id);
    if (userCount > 0) {
        const err = new Error(
            `Không thể xóa tiểu đoàn vì còn ${userCount} người dùng được gán. Hãy chuyển họ sang tiểu đoàn khác trước.`
        );
        err.status = 400;
        throw err;
    }

    battalionModel.deleteById(id);
}

/**
 * @returns {object[]}
 */
export function getRegistrationDashboard() {
    return battalionModel.getRegistrationCounts().map(row =>
        battalionModel.toPublicBattalion(row)
    );
}

/**
 * @param {number} battalionId
 * @returns {boolean}
 */
export function isActiveBattalion(battalionId) {
    const battalion = battalionModel.findById(battalionId);
    return battalion && battalion.is_active === 1;
}

/**
 * @param {number} battalionId
 * @returns {boolean}
 */
export function exists(battalionId) {
    return !!battalionModel.findById(battalionId);
}
