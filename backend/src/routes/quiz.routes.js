import { Router } from 'express';
import { body } from 'express-validator';
import * as quizController from '../controllers/quiz.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();

router.use(requireAuth);

router.get('/outline', quizController.getQuizOutline);

router.get('/', requireAdmin, quizController.getQuiz);

router.put('/', requireAdmin, quizController.putQuiz);

router.patch(
    '/settings',
    requireAdmin,
    validate([
        body('sharedQuestionCount')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Số câu dùng chung phải là số nguyên dương.'),
        body('practiceMixedQuestionCount')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Số câu ôn tập tổng hợp phải là số nguyên dương.'),
        body('practiceMixedSetCount')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Số bộ ôn tập tổng hợp phải là số nguyên dương.'),
        body('examTimeBufferMinutes')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Buffer thời gian phải là số nguyên dương.')
    ]),
    quizController.patchQuizSettings
);

router.post('/topics/:topicId/import', requireAdmin, quizController.importToTopic);

router.get('/practice-mixed/sets', quizController.listPracticeMixedSets);
router.get('/practice-mixed/sets/:id', quizController.getPracticeMixedSet);
router.post('/practice-mixed/sets/:id/progress', quizController.postPracticeMixedProgress);
router.get('/topic-review/:topicId/sets', quizController.listTopicReviewSets);
router.get('/topic-review/:topicId/sets/:setIndex', quizController.getTopicReviewSet);
router.post('/topic-review/:topicId/sets/:setIndex/progress', quizController.postTopicReviewProgress);
router.post(
    '/practice-mixed/regenerate',
    requireAdmin,
    quizController.regeneratePracticeMixedSets
);

router.get('/wrong-history', quizController.getWrongHistory);

router.post('/wrong-history', quizController.postWrongHistory);

router.post('/wrong-review', quizController.postWrongReview);

router.get('/history/all', requireAdmin, quizController.getAllQuizHistory);

router.get('/history', quizController.getQuizHistory);

router.post('/history', quizController.postQuizHistory);

export default router;
