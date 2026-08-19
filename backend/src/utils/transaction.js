/**
 * Run a function inside a SQLite transaction (node:sqlite has no .transaction()).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => void} fn
 * @param {{ immediate?: boolean }} [options] immediate = BEGIN IMMEDIATE (writer lock trước khi đọc)
 */
export function runTransaction(db, fn, options = {}) {
    db.exec(options.immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
        fn();
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}
