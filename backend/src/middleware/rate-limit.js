import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/** Per-account key — avoids shared WiFi / same machine blocking unrelated users */
function authKeyGenerator(req) {
    const militaryId = req.body?.militaryId?.trim();
    if (militaryId) {
        return `auth:${militaryId}`;
    }
    return `auth:ip:${req.ip}`;
}

/** Rate limit for login/register — per military ID, failed attempts only */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.isDev ? 200 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: authKeyGenerator,
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
