#!/usr/bin/env node
/**
 * Run database migration from monorepo root.
 * Usage: npm run migrate
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend');

const child = spawn('node', ['database/migrate.js'], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
});

child.on('exit', code => process.exit(code ?? 1));
