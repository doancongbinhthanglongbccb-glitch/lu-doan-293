import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { requireAuth } from '../middleware/require-auth.js';
import { MILITARY_ID_LENGTH, MIN_PASSWORD_LENGTH } from '../config/constants.js';

const router = Router();

const militaryIdValidator = body('militaryId')
    .trim()
    .isLength({ min: MILITARY_ID_LENGTH, max: MILITARY_ID_LENGTH })
    .withMessage('Số quân nhân phải đúng 8 chữ số.')
    .matches(/^\d{8}$/)
    .withMessage('Số quân nhân chỉ được chứa chữ số.');

const passwordValidator = body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);

router.post(
    '/login',
    authRateLimiter,
    validate([militaryIdValidator, passwordValidator]),
    authController.login
);

router.post(
    '/register',
    authRateLimiter,
    validate([
        militaryIdValidator,
        body('fullName').trim().notEmpty().withMessage('Vui lòng nhập họ và tên.'),
        passwordValidator
    ]),
    authController.register
);

router.post('/logout', requireAuth, authController.logout);

router.get('/me', requireAuth, authController.me);

router.post(
    '/refresh',
    validate([body('refreshToken').notEmpty().withMessage('Thiếu refresh token.')]),
    authController.refresh
);

export default router;
