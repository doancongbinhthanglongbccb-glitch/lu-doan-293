import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { getDb } from '../database/connection.js';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, '..', '..');
const frontendRoot = path.join(monorepoRoot, 'frontend');
const sharedRoot = path.join(monorepoRoot, 'shared');

const app = express();

app.set('trust proxy', 1);

getDb();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
    cors({
        origin: env.isDev ? [env.corsOrigin, `http://localhost:${env.port}`] : true,
        credentials: true
    })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRateLimiter, apiRoutes);
app.use('/shared', express.static(sharedRoot));
app.use(express.static(frontendRoot));

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

app.use(errorHandler);

app.listen(env.port, () => {
    console.log(`[cbquiz] http://localhost:${env.port}`);
    console.log(`[cbquiz] API: http://localhost:${env.port}/api`);
    console.log(`[cbquiz] ENV: ${env.nodeEnv}`);
});
