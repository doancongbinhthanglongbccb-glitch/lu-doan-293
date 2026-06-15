import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { env } from '../src/config/env.js';

/** @type {DatabaseSync|null} */
let db = null;

/**
 * Get or create SQLite connection singleton.
 * @returns {DatabaseSync}
 */
export function getDb() {
    if (db) return db;

    const dir = path.dirname(env.dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new DatabaseSync(env.dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    return db;
}

export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
