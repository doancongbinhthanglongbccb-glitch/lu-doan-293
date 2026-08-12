import { Router } from 'express';
import { body, param } from 'express-validator';
import * as battalionController from '../controllers/battalion.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tiểu đoàn không hợp lệ.');

router.use(requireAuth, requireAdmin);

router.get('/', battalionController.listAll);
router.get('/dashboard/registration', battalionController.registrationDashboard);

router.post(
    '/',
    validate([body('name').trim().notEmpty().withMessage('Tên tiểu đoàn không được trống.')]),
    battalionController.create
);

router.patch(
    '/:id',
    validate([
        idParam,
        body('name').optional().trim().notEmpty().withMessage('Tên tiểu đoàn không được trống.'),
        body('isActive').optional().isBoolean().withMessage('isActive phải là boolean.')
    ]),
    battalionController.update
);

router.delete('/:id', validate([idParam]), battalionController.remove);

export default router;
