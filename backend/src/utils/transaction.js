/**
 * Run a function inside a SQLite transaction (node:sqlite has no .transaction()).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => void} fn
 */
export function runTransaction(db, fn) {
    db.exec('BEGIN');
    try {
        fn();
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}
