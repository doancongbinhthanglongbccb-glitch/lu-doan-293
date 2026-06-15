import { validationResult } from 'express-validator';
import { sendError } from '../utils/response.js';

/**
 * Run express-validator chains and return 400 on failure.
 * @param {import('express-validator').ValidationChain[]} validations
 * @returns {import('express').RequestHandler[]}
 */
export function validate(validations) {
    return [
        ...validations,
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const message = errors
                    .array()
                    .map(e => e.msg)
                    .join(' ');
                return sendError(res, message, 400);
            }
            next();
        }
    ];
}
