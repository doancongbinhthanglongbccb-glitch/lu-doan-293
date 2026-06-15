import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

function requireEnv(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const env = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-in-production-min-32-chars'),
    jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '1h',
    jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    dbPath: path.resolve(
        backendRoot,
        process.env.DB_PATH || './database/cbquiz.db'
    ),
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    isDev: (process.env.NODE_ENV || 'development') !== 'production'
};
