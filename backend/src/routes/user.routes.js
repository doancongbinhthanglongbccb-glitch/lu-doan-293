import { Router } from 'express';
import { body, param } from 'express-validator';
import * as userController from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { MIN_PASSWORD_LENGTH } from '../config/constants.js';

const router = Router();

const militaryIdParam = param('militaryId')
    .matches(/^\d{8}$/)
    .withMessage('Số quân nhân không hợp lệ.');

router.use(requireAuth, requireAdmin);

router.get('/', userController.listUsers);

router.patch(
    '/:militaryId',
    validate([
        militaryIdParam,
        body('fullName').optional().trim().notEmpty().withMessage('Họ tên không được trống.'),
        body('role').optional().isIn(['admin', 'user']).withMessage('Vai trò không hợp lệ.'),
        body('status')
            .optional()
            .isIn(['pending', 'approved', 'rejected'])
            .withMessage('Trạng thái không hợp lệ.')
    ]),
    userController.updateUser
);

router.patch('/:militaryId/approve', validate([militaryIdParam]), userController.approveUser);

router.patch('/:militaryId/reject', validate([militaryIdParam]), userController.rejectUser);

router.post(
    '/:militaryId/reset-password',
    validate([
        militaryIdParam,
        body('newPassword')
            .isLength({ min: MIN_PASSWORD_LENGTH })
            .withMessage(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`)
    ]),
    userController.resetPassword
);

router.delete('/:militaryId', validate([militaryIdParam]), userController.deleteUser);

export default router;
