import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import quizRoutes from './quiz.routes.js';
import battalionRoutes from './battalion.routes.js';
import examRoutes from './exam.routes.js';
import lectureRoutes from './lecture.routes.js';

const router = Router();

router.get('/health', (req, res) => {
    res.json({ success: true, message: 'CBQuiz API is running.' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/battalions', battalionRoutes);
router.use('/exam', examRoutes);
router.use('/lectures', lectureRoutes);
router.use('/quiz', quizRoutes);

router.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Không tìm thấy: ${req.method} ${req.originalUrl}`
    });
});

export default router;
