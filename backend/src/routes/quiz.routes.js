import { Router } from 'express';
import { body } from 'express-validator';
import * as quizController from '../controllers/quiz.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();

router.use(requireAuth);

router.get('/', quizController.getQuiz);

router.put('/', requireAdmin, quizController.putQuiz);

router.patch(
    '/settings',
    requireAdmin,
    validate([
        body('practiceMixedQuestionCount')
            .isInt({ min: 1 })
            .withMessage('Số câu ôn tập tổng hợp phải là số nguyên dương.')
    ]),
    quizController.patchQuizSettings
);

router.post('/topics/:topicId/import', requireAdmin, quizController.importToTopic);

router.get('/wrong-history', quizController.getWrongHistory);

router.post('/wrong-history', quizController.postWrongHistory);

router.get('/history/all', requireAdmin, quizController.getAllQuizHistory);

router.get('/history', quizController.getQuizHistory);

router.post('/history', quizController.postQuizHistory);

export default router;
