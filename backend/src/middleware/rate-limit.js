import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/** Rate limit for login/register — strict in production, relaxed when testing locally */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.isDev ? 200 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.'
    }
});

/** General API rate limit */
export const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
    }
});
