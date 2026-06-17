import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const DEV_JWT_FALLBACK = 'dev-secret-change-in-production-min-32-chars';

function requireEnv(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv !== 'production';
const jwtSecret = requireEnv('JWT_SECRET', DEV_JWT_FALLBACK);

if (!isDev && jwtSecret === DEV_JWT_FALLBACK) {
    throw new Error('JWT_SECRET must be set to a strong random value in production.');
}

const rawDbPath = process.env.DB_PATH || './database/cbquiz.db';

export const env = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv,
    jwtSecret,
    jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '1h',
    jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    dbPath: path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(backendRoot, rawDbPath),
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    adminPassword: process.env.ADMIN_PASSWORD || null,
    isDev
};
