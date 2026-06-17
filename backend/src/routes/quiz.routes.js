import { Router } from 'express';
import * as quizController from '../controllers/quiz.controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireAdmin } from '../middleware/require-admin.js';

const router = Router();

router.use(requireAuth);

router.get('/', quizController.getQuiz);

router.put('/', requireAdmin, quizController.putQuiz);

router.get('/wrong-history', quizController.getWrongHistory);

router.post('/wrong-history', quizController.postWrongHistory);

router.get('/history/all', requireAdmin, quizController.getAllQuizHistory);

router.get('/history', quizController.getQuizHistory);

router.post('/history', quizController.postQuizHistory);

export default router;
