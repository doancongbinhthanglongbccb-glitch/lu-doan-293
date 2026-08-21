import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as lectureController from '../controllers/lecture.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();
const idParam = param('id').isInt({ min: 1 }).withMessage('ID bài giảng không hợp lệ.');

router.use(requireAuth);

router.get(
    '/',
    validate([
        query('type').optional().isIn(['video', 'document']),
        query('status').optional().isIn(['pending', 'ready', 'failed']),
        query('battalion_id').optional().isInt({ min: 1 })
    ]),
    lectureController.listLectures
);

router.get('/:id/url', validate([idParam]), lectureController.getPlaybackUrl);

router.post(
    '/',
    requireAdmin,
    validate([
        body('title').trim().notEmpty().withMessage('Vui lòng nhập tiêu đề.'),
        body('type').isIn(['video', 'document']).withMessage("type chỉ nhận 'video' hoặc 'document'."),
        body('content_type').notEmpty().withMessage('Thiếu content_type.'),
        body('original_name').notEmpty().withMessage('Thiếu original_name.'),
        body('description').optional({ values: 'null' }),
        body('battalion_ids').optional().isArray(),
        body('battalion_ids.*').optional().isInt({ min: 1 }),
        body('size_bytes').optional({ values: 'null' }).isInt({ min: 0 })
    ]),
    lectureController.createLecture
);

router.post('/:id/confirm', requireAdmin, validate([idParam]), lectureController.confirmLecture);

router.put(
    '/:id',
    requireAdmin,
    validate([
        idParam,
        body('title').optional().trim().notEmpty().withMessage('Vui lòng nhập tiêu đề.'),
        body('battalion_ids').optional().isArray(),
        body('battalion_ids.*').optional().isInt({ min: 1 })
    ]),
    lectureController.updateLecture
);

router.delete('/:id', requireAdmin, validate([idParam]), lectureController.deleteLecture);

export default router;
