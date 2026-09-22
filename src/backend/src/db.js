import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DEFAULT_DB = join(DATA_DIR, 'medagentx.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

const DB_PATH = process.env.DB_PATH || DEFAULT_DB;

if (!existsSync(DATA_DIR) && !process.env.DB_PATH) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

export function initSchema() {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  migrate();
}

/**
 * Lightweight, idempotent migrations for databases created before a column was
 * introduced. New columns are appended with ALTER TABLE; missing-column errors
 * are ignored. New tables are handled by CREATE TABLE IF NOT EXISTS.
 */
const COLUMN_MIGRATIONS = [
  ['patients', 'patient_type', "TEXT NOT NULL DEFAULT 'emergency'"],
  ['patients', 'portal_code', 'TEXT'],
  ['prescriptions', 'fulfillment_status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['prescriptions', 'prepared_by', 'TEXT'],
  ['prescriptions', 'dispensed_at', 'TEXT'],
  ['prescriptions', 'source', "TEXT NOT NULL DEFAULT 'opd'"],
  ['appointments', 'department_id', 'TEXT'],
  ['appointments', 'shift', 'TEXT'],
  ['emergencies', 'triage_confidence', 'REAL'],
  ['emergencies', 'triage_evidence', 'TEXT'],
  ['alerts', 'recipient_doctor_id', 'TEXT'],
];

function migrate() {
  for (const [table, column, def] of COLUMN_MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err;
      }
    }
  }
}

/** Return all rows for a query. */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

/** Return the first row (or undefined). */
export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

/** Execute a write statement and return { changes, lastInsertRowid }. */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

/** Run fn inside a transaction. node:sqlite is synchronous. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

initSchema();

export default { db, all, get, run, tx, initSchema };
