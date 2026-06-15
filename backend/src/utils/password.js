import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Hash a plain password.
 * @param {string} plain
 * @returns {Promise<string>}
 */
export async function hashPassword(plain) {
    return bcrypt.hash(plain, env.bcryptRounds);
}

/**
 * Compare plain password with hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
