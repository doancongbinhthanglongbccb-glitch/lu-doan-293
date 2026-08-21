import * as lectureService from '../services/lecture.service.js';
import { sendSuccess } from '../utils/response.js';

export async function listLectures(req, res, next) {
    try {
        const lectures = lectureService.listLectures(req.user, req.query);
        sendSuccess(res, { lectures });
    } catch (err) {
        next(err);
    }
}

export async function createLecture(req, res, next) {
    try {
        const payload = await lectureService.createLecture(req.body, req.user.id);
        sendSuccess(res, payload, 'Đã tạo bài giảng. Hãy tải tệp lên rồi xác nhận.', 201);
    } catch (err) {
        next(err);
    }
}

export async function confirmLecture(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const lecture = await lectureService.confirmLecture(id);
        sendSuccess(res, { lecture }, 'Bài giảng đã sẵn sàng.');
    } catch (err) {
        next(err);
    }
}

export async function updateLecture(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const lecture = lectureService.updateLecture(id, req.body);
        sendSuccess(res, { lecture }, 'Đã cập nhật bài giảng.');
    } catch (err) {
        next(err);
    }
}

export async function deleteLecture(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        await lectureService.deleteLecture(id);
        sendSuccess(res, null, 'Đã xóa bài giảng.');
    } catch (err) {
        next(err);
    }
}

export async function getPlaybackUrl(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const payload = await lectureService.getPlaybackUrl(id, req.user);
        sendSuccess(res, payload);
    } catch (err) {
        next(err);
    }
}
