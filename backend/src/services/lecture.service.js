import crypto from 'crypto';
import path from 'path';
import * as lectureModel from '../models/lecture.model.js';
import * as battalionModel from '../models/battalion.model.js';
import * as storage from './storage.service.js';
import {
    LECTURE_TYPES,
    LECTURE_STATUS,
    LECTURE_MIME_WHITELIST,
    LECTURE_MIME_BY_TYPE,
    LECTURE_PUT_EXPIRES_SEC,
    LECTURE_GET_EXPIRES_SEC,
    USER_ROLES
} from '../config/constants.js';

function err(message, status = 400) {
    const e = new Error(message);
    e.status = status;
    return e;
}

/**
 * @param {object} row
 * @returns {object|null}
 */
export function toPublicLecture(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        type: row.type,
        storage_key: row.storage_key,
        original_name: row.original_name ?? null,
        mime_type: row.mime_type ?? null,
        size_bytes: row.size_bytes ?? null,
        status: row.status,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        battalions: (row.battalions || []).map(b => ({ id: b.id, name: b.name }))
    };
}

/**
 * @param {string} type
 * @param {string} contentType
 */
export function assertAllowedMime(type, contentType) {
    const mime = String(contentType || '').trim().toLowerCase();
    if (!LECTURE_MIME_WHITELIST.includes(mime)) {
        throw err('Định dạng tệp không được hỗ trợ. Chỉ nhận video/mp4, video/webm, application/pdf.');
    }
    const allowedForType = LECTURE_MIME_BY_TYPE[type] || [];
    if (!allowedForType.includes(mime)) {
        throw err(
            type === LECTURE_TYPES.VIDEO
                ? 'Bài video chỉ nhận video/mp4 hoặc video/webm.'
                : 'Tài liệu chỉ nhận application/pdf.'
        );
    }
    return mime;
}

function sanitizeFilename(name) {
    const base = path.basename(String(name || 'file'));
    const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
    return (cleaned || 'file').slice(0, 80);
}

function normalizeBattalionIds(raw) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) throw err('battalion_ids phải là mảng số.');
    const ids = [...new Set(raw.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0))];
    ids.forEach(id => {
        if (!battalionModel.findById(id)) {
            throw err(`Không tìm thấy tiểu đoàn #${id}.`);
        }
    });
    return ids;
}

function notFoundReady() {
    return err('Không tìm thấy bài giảng.', 404);
}

/**
 * @param {object} body
 * @param {number} adminId
 */
export async function createLecture(body, adminId) {
    const title = String(body.title || '').trim();
    if (!title) throw err('Vui lòng nhập tiêu đề.');

    const type = body.type;
    if (type !== LECTURE_TYPES.VIDEO && type !== LECTURE_TYPES.DOCUMENT) {
        throw err("type chỉ nhận 'video' hoặc 'document'.");
    }

    const mime = assertAllowedMime(type, body.content_type);
    const originalName = String(body.original_name || 'file').trim() || 'file';
    const sizeBytes =
        body.size_bytes == null || body.size_bytes === ''
            ? null
            : parseInt(body.size_bytes, 10);
    if (sizeBytes != null && (!Number.isInteger(sizeBytes) || sizeBytes < 0)) {
        throw err('size_bytes không hợp lệ.');
    }

    const battalionIds = normalizeBattalionIds(body.battalion_ids);
    const storageKey = `lectures/${crypto.randomUUID()}-${sanitizeFilename(originalName)}`;

    const row = lectureModel.create({
        title,
        description: body.description != null ? String(body.description).trim() : null,
        type,
        storage_key: storageKey,
        original_name: originalName,
        mime_type: mime,
        size_bytes: sizeBytes,
        status: LECTURE_STATUS.PENDING,
        created_by: adminId,
        battalion_ids: battalionIds
    });

    try {
        const uploadUrl = await storage.getPresignedPutUrl(storageKey, mime, LECTURE_PUT_EXPIRES_SEC);
        return {
            id: row.id,
            storage_key: row.storage_key,
            upload_url: uploadUrl,
            expires_in: LECTURE_PUT_EXPIRES_SEC
        };
    } catch (e) {
        lectureModel.deleteById(row.id);
        throw e;
    }
}

/**
 * Mọi admin được confirm. Chỉ khi pending. Không tự set failed.
 * @param {number} id
 */
export async function confirmLecture(id) {
    const row = lectureModel.findById(id);
    if (!row) throw err('Không tìm thấy bài giảng.', 404);
    if (row.status === LECTURE_STATUS.READY) {
        throw err('Bài giảng đã sẵn sàng, không cần xác nhận lại.', 409);
    }
    if (row.status !== LECTURE_STATUS.PENDING) {
        throw err('Chỉ xác nhận được bài đang chờ xử lý.', 409);
    }

    const head = await storage.headObject(row.storage_key);
    if (!head) {
        throw err('File chưa có trên storage, vui lòng thử upload lại.', 400);
    }
    if (!head.contentLength || head.contentLength <= 0) {
        throw err('File chưa có trên storage, vui lòng thử upload lại.', 400);
    }
    if (row.size_bytes != null && head.contentLength !== row.size_bytes) {
        throw err('File chưa có trên storage, vui lòng thử upload lại.', 400);
    }

    return toPublicLecture(lectureModel.confirmReady(id));
}

/**
 * @param {number} id
 * @param {object} body
 */
export function updateLecture(id, body) {
    const row = lectureModel.findById(id);
    if (!row) throw err('Không tìm thấy bài giảng.', 404);

    const fields = {};
    if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) throw err('Vui lòng nhập tiêu đề.');
        fields.title = title;
    }
    if (body.description !== undefined) {
        fields.description = body.description == null ? null : String(body.description).trim();
    }
    if (body.battalion_ids !== undefined) {
        fields.battalion_ids = normalizeBattalionIds(body.battalion_ids);
    }
    return toPublicLecture(lectureModel.update(id, fields));
}

/**
 * Xóa object trước; nếu storage lỗi thì giữ row.
 * @param {number} id
 */
export async function deleteLecture(id) {
    const row = lectureModel.findById(id);
    if (!row) throw err('Không tìm thấy bài giảng.', 404);
    try {
        await storage.deleteObject(row.storage_key);
    } catch {
        throw err('Không xóa được tệp trên storage. Thử lại sau.', 502);
    }
    lectureModel.deleteById(id);
    return true;
}

/**
 * @param {object} user
 * @param {{ type?: string, battalion_id?: string, status?: string }} query
 */
export function listLectures(user, query = {}) {
    if (user.role === USER_ROLES.ADMIN) {
        const filters = {};
        if (query.type === LECTURE_TYPES.VIDEO || query.type === LECTURE_TYPES.DOCUMENT) {
            filters.type = query.type;
        }
        if (
            query.status === LECTURE_STATUS.PENDING ||
            query.status === LECTURE_STATUS.READY ||
            query.status === LECTURE_STATUS.FAILED
        ) {
            filters.status = query.status;
        }
        const battalionId = parseInt(query.battalion_id, 10);
        if (Number.isInteger(battalionId) && battalionId > 0) {
            filters.battalion_id = battalionId;
        }
        return lectureModel.listForAdmin(filters).map(toPublicLecture);
    }
    return lectureModel.listForUser(user.battalion_id ?? null).map(toPublicLecture);
}

/**
 * Không tồn tại / không ready → 404.
 * Ready nhưng user sai tiểu đoàn → 403.
 * Admin bỏ qua check tiểu đoàn.
 * @param {number} id
 * @param {object} user
 */
export async function getPlaybackUrl(id, user) {
    const row = lectureModel.findById(id);
    if (!row || row.status !== LECTURE_STATUS.READY) {
        throw notFoundReady();
    }

    const isAdmin = user.role === USER_ROLES.ADMIN;
    if (!isAdmin && !lectureModel.lectureVisibleToBattalion(id, user.battalion_id ?? null)) {
        throw err('Bài giảng không thuộc tiểu đoàn của bạn.', 403);
    }

    const url = await storage.getPresignedGetUrl(row.storage_key, LECTURE_GET_EXPIRES_SEC);
    return {
        url,
        expires_in: LECTURE_GET_EXPIRES_SEC,
        type: row.type,
        title: row.title,
        original_name: row.original_name,
        mime_type: row.mime_type
    };
}
