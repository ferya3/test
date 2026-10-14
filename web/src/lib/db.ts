/**
 * The database: SQLite through Node's own `node:sqlite`, no package installed.
 *
 * Synchronous on purpose. A factory catalogue site does a handful of indexed
 * reads per request; DatabaseSync answers those in microseconds and avoids an
 * async pool that would buy nothing here.
 *
 * Imports in this file use relative paths with a `.ts` extension rather than
 * the `@/` alias, because the seed script runs it under
 * `node --experimental-strip-types`, which resolves neither.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'app.db');

/**
 * Schema migrations, applied in order and tracked in SQLite's own
 * `user_version` pragma — no migrations table to keep in step.
 *
 * Append only. Editing a migration that has already run on a server changes
 * nothing there, and leaves that server on a schema no other copy has.
 */
const MIGRATIONS: string[] = [
  /* 1 — initial schema */ `
    CREATE TABLE categories (
      id          INTEGER PRIMARY KEY,
      slug        TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      short       TEXT    NOT NULL DEFAULT '',
      description TEXT    NOT NULL DEFAULT '',
      position    INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE products (
      id          INTEGER PRIMARY KEY,
      slug        TEXT    NOT NULL UNIQUE,
      code        TEXT    NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name        TEXT    NOT NULL,
      short       TEXT    NOT NULL DEFAULT '',
      description TEXT    NOT NULL DEFAULT '',
      family      TEXT    NOT NULL,
      surface     TEXT    NOT NULL,
      thicknesses TEXT    NOT NULL DEFAULT '',
      color_hex   TEXT    NOT NULL DEFAULT '#d9d2c8',
      image       TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- The query shapes the catalogue actually runs.
    CREATE INDEX products_listing ON products (category_id, is_active, position);
    CREATE INDEX products_featured ON products (is_featured, is_active);

    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE leads (
      id           INTEGER PRIMARY KEY,
      kind         TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      phone        TEXT    NOT NULL,
      email        TEXT    NOT NULL DEFAULT '',
      message      TEXT    NOT NULL DEFAULT '',
      product_slug TEXT,
      is_read      INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX leads_inbox ON leads (is_read, created_at);

    CREATE TABLE users (
      id            INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Only a hash of the session token is stored, so a copy of the database
    -- does not hand out working sessions.
    CREATE TABLE sessions (
      token_hash TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX sessions_expiry ON sessions (expires_at);

    CREATE TABLE login_attempts (
      key TEXT    NOT NULL,
      at  INTEGER NOT NULL
    );
    CREATE INDEX login_attempts_window ON login_attempts (key, at);
  `,

  /* 2 — two-factor authentication */ `
    -- totp_secret is set when enrolment starts and only trusted once
    -- totp_enabled is 1, i.e. after a code from the authenticator verified.
    ALTER TABLE users ADD COLUMN totp_secret    TEXT;
    ALTER TABLE users ADD COLUMN totp_enabled   INTEGER NOT NULL DEFAULT 0;
    -- The last accepted time step: a code is single-use even inside its window.
    ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;

    -- 'mfa' sessions have passed the password but not the second factor, and
    -- open nothing except the code form.
    ALTER TABLE sessions ADD COLUMN stage TEXT NOT NULL DEFAULT 'full';
  `,
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row.user_version;

  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function open(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new DatabaseSync(DB_PATH);

  // WAL lets the dev server's workers and a running seed read while one
  // writes; busy_timeout turns a momentary lock into a short wait rather than
  // an immediate SQLITE_BUSY.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');

  migrate(db);

  return db;
}

/*
 * One connection per process. Next's dev server reloads modules on every edit,
 * which would otherwise open a fresh handle each time and leak the old ones,
 * so the instance is parked on globalThis.
 */
const globalForDb = globalThis as unknown as { __db?: DatabaseSync };

export const db: DatabaseSync = globalForDb.__db ?? open();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__db = db;
}

/** Run `fn` inside a transaction, rolling back if it throws. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
