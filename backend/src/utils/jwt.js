import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { TOKEN_TYPES } from '../config/constants.js';

/**
 * Sign access token.
 * @param {{ id: number, militaryId: string, role: string }} user
 * @returns {string}
 */
export function signAccessToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            militaryId: user.militaryId,
            role: user.role,
            type: TOKEN_TYPES.ACCESS
        },
        env.jwtSecret,
        { expiresIn: env.jwtAccessExpires }
    );
}

/**
 * Sign refresh token.
 * @param {{ id: number, militaryId: string }} user
 * @returns {string}
 */
export function signRefreshToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            militaryId: user.militaryId,
            type: TOKEN_TYPES.REFRESH
        },
        env.jwtSecret,
        { expiresIn: env.jwtRefreshExpires }
    );
}

/**
 * Verify JWT and return payload.
 * @param {string} token
 * @returns {object}
 */
export function verifyToken(token) {
    return jwt.verify(token, env.jwtSecret);
}

/**
 * Hash refresh token for DB storage.
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Compute refresh token expiry ISO string from JWT exp claim.
 * @param {string} token
 * @returns {string}
 */
export function getTokenExpiry(token) {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString();
    }
    return new Date(decoded.exp * 1000).toISOString();
}
