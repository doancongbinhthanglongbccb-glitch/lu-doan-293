import rateLimit from 'express-rate-limit';

/** Rate limit for login/register — 5 attempts per 15 minutes per IP */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
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
