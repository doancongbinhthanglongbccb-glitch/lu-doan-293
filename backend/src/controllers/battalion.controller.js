import * as battalionService from '../services/battalion.service.js';
import { sendSuccess } from '../utils/response.js';

export function listActive(req, res, next) {
    try {
        const battalions = battalionService.listActive();
        sendSuccess(res, { battalions });
    } catch (err) {
        next(err);
    }
}

export function listAll(req, res, next) {
    try {
        const battalions = battalionService.listAll();
        sendSuccess(res, { battalions });
    } catch (err) {
        next(err);
    }
}

export function create(req, res, next) {
    try {
        const battalion = battalionService.createBattalion(req.body.name);
        sendSuccess(res, { battalion }, 'Đã thêm tiểu đoàn.', 201);
    } catch (err) {
        next(err);
    }
}

export function update(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const battalion = battalionService.updateBattalion(id, req.body);
        sendSuccess(res, { battalion }, 'Đã cập nhật tiểu đoàn.');
    } catch (err) {
        next(err);
    }
}

export function remove(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        battalionService.deleteBattalion(id);
        sendSuccess(res, null, 'Đã xóa tiểu đoàn.');
    } catch (err) {
        next(err);
    }
}

export function registrationDashboard(req, res, next) {
    try {
        const stats = battalionService.getRegistrationDashboard();
        sendSuccess(res, { stats });
    } catch (err) {
        next(err);
    }
}
