import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import quizRoutes from './quiz.routes.js';

const router = Router();

router.get('/health', (req, res) => {
    res.json({ success: true, message: 'CBQuiz API is running.' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/quiz', quizRoutes);

router.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Không tìm thấy: ${req.method} ${req.originalUrl}`
    });
});

export default router;
