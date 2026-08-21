import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(backendRoot, '.env') });
// STORAGE_* đọc từ backend/.env — đổi .env rồi restart (nodemon watch file .env).

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

const authRateLimitFlag = (process.env.AUTH_RATE_LIMIT ?? '1').toLowerCase();

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
    isDev,
    authRateLimitEnabled: !['0', 'false', 'off'].includes(authRateLimitFlag),
    storageDriver: (process.env.STORAGE_DRIVER || 's3').toLowerCase(),
    storageEndpoint: process.env.STORAGE_ENDPOINT || '',
    storageAccessKey: process.env.STORAGE_ACCESS_KEY || '',
    storageSecretKey: process.env.STORAGE_SECRET_KEY || '',
    storageBucket: process.env.STORAGE_BUCKET || 'lectures',
    storageRegion: process.env.STORAGE_REGION || 'auto',
    storagePublicEndpoint:
        process.env.STORAGE_PUBLIC_ENDPOINT || process.env.STORAGE_ENDPOINT || ''
};

/** Origin trình duyệt gọi PUT/GET (MinIO/R2) — dùng cho Helmet CSP. */
export function getStoragePublicOrigin() {
    const raw = env.storagePublicEndpoint;
    if (!raw) return null;
    try {
        return new URL(raw).origin;
    } catch {
        return null;
    }
}
