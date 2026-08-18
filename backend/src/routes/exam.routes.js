import { Router } from 'express';
import { body, param } from 'express-validator';
import * as examController from '../controllers/exam.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();
const idParam = param('id').isInt({ min: 1 }).withMessage('ID đợt không hợp lệ.');

router.use(requireAuth);

router.get('/sessions/open', examController.listOpenSessions);
router.get('/history', examController.listMyCheckHistory);
router.get('/history/all', requireAdmin, examController.listCheckHistoryAdmin);
router.get('/sessions', requireAdmin, examController.listSessionsAdmin);
router.get(
    '/sessions/:id/progress-matrix',
    requireAdmin,
    validate([idParam]),
    examController.getProgressMatrix
);
router.get('/sessions/:id/topics', validate([idParam]), examController.listSessionTopics);
router.get('/sessions/:id/branches', validate([idParam]), examController.listSessionBranches);
router.get('/sessions/:id/sets', validate([idParam]), examController.listSessionSets);
router.get('/sessions/:id/readiness', validate([idParam]), examController.getReadiness);
router.post('/sessions/:id/start', validate([idParam]), examController.startSession);
router.post(
    '/sessions/:id/submit',
    validate([idParam]),
    examController.submitSession
);

router.post(
    '/sessions',
    requireAdmin,
    validate([
        body('battalionIds').isArray({ min: 1 }).withMessage('Vui lòng chọn ít nhất một tiểu đoàn.'),
        body('battalionIds.*').isInt({ min: 1 }),
        body('type').isIn(['topic', 'mixed']),
        body('questionsPerSet').isInt({ min: 1 }),
        body('numberOfSets').isInt({ min: 1 }),
        body('durationMinutes').isInt({ min: 1 }),
        body('opensAt').notEmpty(),
        body('closesAt').notEmpty()
    ]),
    examController.createSession
);
router.patch('/sessions/:id', requireAdmin, validate([idParam]), examController.updateSession);
router.post(
    '/sessions/:id/open',
    requireAdmin,
    validate([idParam]),
    examController.openSession
);
router.post('/sessions/:id/close', requireAdmin, validate([idParam]), examController.closeSession);
router.post(
    '/sessions/:id/regenerate',
    requireAdmin,
    validate([idParam]),
    examController.regenerateSession
);

export default router;
