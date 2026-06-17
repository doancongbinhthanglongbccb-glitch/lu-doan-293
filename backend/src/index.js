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

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdn.sheetjs.com', "'unsafe-eval'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"]
            }
        }
    })
);
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

/** Clean page URLs (no .html in the address bar) */
const pages = {
    login: 'login.html',
    register: 'register.html',
    admin: 'admin.html',
    quiz: 'index.html'
};

for (const [route, file] of Object.entries(pages)) {
    app.get(`/${route}`, (req, res) => {
        res.sendFile(path.join(frontendRoot, file));
    });
    app.get(`/${file}`, (req, res) => {
        res.redirect(301, `/${route}`);
    });
}

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.use(express.static(frontendRoot));

app.use(errorHandler);

app.listen(env.port, () => {
    console.log(`[cbquiz] http://localhost:${env.port}`);
    console.log(`[cbquiz] API: http://localhost:${env.port}/api`);
    console.log(`[cbquiz] ENV: ${env.nodeEnv}`);
});
