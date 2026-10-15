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
import { CATEGORY_EN, PROJECT_EN, STEP_EN, productEnglish } from './english-content.ts';
import { DEFAULT_ATTRIBUTES } from './catalog.ts';

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'app.db');

/**
 * Schema migrations, applied in order and tracked in SQLite's own
 * `user_version` pragma — no migrations table to keep in step.
 *
 * Append only. Editing a migration that has already run on a server changes
 * nothing there, and leaves that server on a schema no other copy has.
 */
type Migration = string | ((db: DatabaseSync) => void);

const MIGRATIONS: Migration[] = [
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

  /* 3 — production steps and completed projects, both with photos */ `
    -- The five steps of the production strip on the home and about pages.
    -- A fixed set: the admin edits their text and photo, not their number.
    CREATE TABLE process_steps (
      id       INTEGER PRIMARY KEY,
      position INTEGER NOT NULL,
      title    TEXT    NOT NULL,
      body     TEXT    NOT NULL DEFAULT '',
      image    TEXT
    );

    -- Seeded here rather than in the seed script, so a server that only runs
    -- update.sh gets them too.
    INSERT INTO process_steps (position, title, body) VALUES
      (1, 'آغشته‌سازی کاغذ', 'کاغذ کرافت در رزین فنولیک و کاغذ دکور در رزین ملامین غوطه‌ور و خشک می‌شود.'),
      (2, 'چیدمان لایه‌ها', 'لایه‌ها به تعداد لازم برای هر ضخامت روی هم چیده می‌شوند؛ دکور و لایهٔ محافظ در رو.'),
      (3, 'پرس فشار بالا', 'زیر فشار بیش از ۷۰ بار و دمای حدود ۱۴۰ درجه، لایه‌ها به یک ورق یکپارچه تبدیل می‌شوند.'),
      (4, 'برش و کالیبره', 'ورق به ابعاد استاندارد برش می‌خورد و پشت آن برای چسبندگی یکنواخت سنباده می‌شود.'),
      (5, 'کنترل کیفیت', 'ثبات رنگ، مقاومت سایشی و ضخامت هر بچ در آزمایشگاه کارخانه اندازه‌گیری می‌شود.');

    CREATE TABLE projects (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      location    TEXT    NOT NULL DEFAULT '',
      year        TEXT    NOT NULL DEFAULT '',
      description TEXT    NOT NULL DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      -- Colour of the material used: drawn into the illustration shown until
      -- a photograph is uploaded.
      color_hex   TEXT    NOT NULL DEFAULT '#c49a6c',
      image       TEXT,
      position    INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX projects_listing ON projects (is_active, position);

    -- The two product groups, in case this runs on a fresh database before
    -- the seed script has created them (the seed then fills in the rest).
    INSERT OR IGNORE INTO categories (slug, name, position) VALUES
      ('hpl-cabinet-panel', 'صفحه کابینت اچ‌پی‌ال', 0),
      ('hpl-compact', 'کامپکت اچ‌پی‌ال', 1);

    -- Starter entries describing typical uses of each product, so the section
    -- is not empty on day one. Once, here in the migration: an editor who
    -- deletes them does not get them back. They carry no photo, client or
    -- place; the admin replaces them with real projects.
    INSERT INTO projects (title, description, category_id, color_hex, position) VALUES
      ('آشپزخانهٔ مسکونی با طرح بلوط',
       'بدنه و درب کابینت‌ها با صفحه کابینت اچ‌پی‌ال طرح بلوط طبیعی و سطح طرح‌دار.',
       (SELECT id FROM categories WHERE slug = 'hpl-cabinet-panel'), '#c49a6c', 1),
      ('سرویس بهداشتی مجتمع اداری',
       'پارتیشن‌بندی کابین‌ها با کامپکت اچ‌پی‌ال ۱۲ میلی‌متری؛ بدون قاب و مقاوم در برابر شست‌وشوی روزانه.',
       (SELECT id FROM categories WHERE slug = 'hpl-compact'), '#2f4438', 2),
      ('آشپزخانهٔ مدرن تک‌رنگ',
       'درب‌های های‌گلاس گرافیتی با بدنهٔ سفید؛ سطحی که اثر انگشت و لک را راحت پس می‌دهد.',
       (SELECT id FROM categories WHERE slug = 'hpl-cabinet-panel'), '#3a3d40', 3),
      ('رختکن و کمدهای باشگاه ورزشی',
       'کمدها و پارتیشن‌های رختکن از کامپکت اچ‌پی‌ال، در محیطی با رطوبت و رفت‌وآمد زیاد.',
       (SELECT id FROM categories WHERE slug = 'hpl-compact'), '#a5a29c', 4),
      ('کمد دیواری و اتاق خواب',
       'کمد دیواری تمام‌قد با صفحه کابینت سوپرمات سفید و دستگیره‌های مخفی.',
       (SELECT id FROM categories WHERE slug = 'hpl-cabinet-panel'), '#ecebe6', 5),
      ('سرویس بهداشتی مدرسه',
       'کابین‌های کامپکت با رنگ روشن و یراق استیل؛ مقاوم در برابر ضربه و خط‌وخش.',
       (SELECT id FROM categories WHERE slug = 'hpl-compact'), '#d8cfc2', 6);
  `,

  /* 4 — English: a second column for every piece of editable text */
  (db) => {
    const add = (table: string, columns: string[]) =>
      columns.forEach((c) => db.exec(`ALTER TABLE ${table} ADD COLUMN ${c}_en TEXT NOT NULL DEFAULT ''`));

    add('categories', ['name', 'short', 'description']);
    add('products', ['name', 'short', 'description']);
    add('process_steps', ['title', 'body']);
    add('projects', ['title', 'location', 'description']);
    // Site settings take their English as separate keys (`hero_title_en`).

    // English for the content the site started with; anything an editor
    // added gets its English in the admin. Empty English falls back to the
    // Persian on the English site rather than showing nothing.
    const category = db.prepare('UPDATE categories SET name_en = ?, short_en = ?, description_en = ? WHERE slug = ?');
    for (const [slug, en] of Object.entries(CATEGORY_EN)) category.run(en.name, en.short, en.description, slug);

    const product = db.prepare('UPDATE products SET name_en = ?, short_en = ?, description_en = ? WHERE id = ?');
    for (const row of db.prepare('SELECT id, slug FROM products').all() as { id: number; slug: string }[]) {
      const en = productEnglish(row.slug);
      if (en) product.run(en.name, en.short, en.description, row.id);
    }

    const step = db.prepare('UPDATE process_steps SET title_en = ?, body_en = ? WHERE position = ?');
    for (const [position, en] of Object.entries(STEP_EN)) step.run(en.title, en.body, Number(position));

    const project = db.prepare('UPDATE projects SET title_en = ?, description_en = ? WHERE title = ?');
    for (const [title, en] of Object.entries(PROJECT_EN)) project.run(en.title, en.description, title);
  },

  /* 5 — editable product attributes; group cover photos */
  (db) => {
    // Decor families, surfaces and thicknesses, until now fixed in code.
    // Products keep storing the `value` (family, surface, comma-separated
    // thicknesses), so no product row changes.
    db.exec(`
      CREATE TABLE attributes (
        id       INTEGER PRIMARY KEY,
        kind     TEXT    NOT NULL CHECK (kind IN ('family', 'surface', 'thickness')),
        value    TEXT    NOT NULL,
        name     TEXT    NOT NULL,
        name_en  TEXT    NOT NULL DEFAULT '',
        -- Families only: how a swatch is drawn when there is no photo.
        texture  TEXT    NOT NULL DEFAULT 'solid',
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, value)
      );
    `);

    const insert = db.prepare('INSERT INTO attributes (kind, value, name, name_en, texture, position) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [kind, rows] of Object.entries(DEFAULT_ATTRIBUTES)) {
      rows.forEach(([value, name, nameEn, texture], i) => insert.run(kind, value, name, nameEn, texture, i));
    }

    // A photo behind the heading of each product group's page, and which
    // drawing stands in for a project photo in that group.
    db.exec(`ALTER TABLE categories ADD COLUMN image TEXT`);
    db.exec(`ALTER TABLE categories ADD COLUMN scene TEXT NOT NULL DEFAULT 'kitchen'`);
    db.exec(`UPDATE categories SET scene = 'cubicles' WHERE slug = 'hpl-compact'`);
  },

  /* 6 — search: page titles and descriptions, and Persian letter forms */
  (db) => {
    // Optional search-result title and description per product and group,
    // in both languages. Empty means "work it out from the content".
    for (const table of ['products', 'categories']) {
      for (const column of ['seo_title', 'seo_title_en', 'seo_description', 'seo_description_en']) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
      }
    }

    // Arabic ي ى ك, typed on some keyboards, look like Persian ی ک but are
    // different letters: a search for «کابینت» does not match «كابينت».
    // Every Persian text already stored is brought to the Persian forms;
    // new text is normalised as it is saved (src/lib/validate.ts).
    const fix = (column: string) => `replace(replace(replace(${column}, 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک')`;
    const columns: Record<string, string[]> = {
      products: ['name', 'short', 'description'],
      categories: ['name', 'short', 'description'],
      projects: ['title', 'location', 'description'],
      process_steps: ['title', 'body'],
      attributes: ['name'],
      settings: ['value'],
      leads: ['name', 'message'],
    };
    for (const [table, cols] of Object.entries(columns)) {
      db.exec(`UPDATE ${table} SET ${cols.map((c) => `${c} = ${fix(c)}`).join(', ')}`);
    }

    // The English seed text said "a embossed surface".
    for (const column of ['short_en', 'description_en']) {
      db.exec(`UPDATE products SET ${column} = replace(${column}, ' a embossed ', ' an embossed ')`);
    }
  },

  /* 7 — a photo for each group's card on the home page */
  (db) => {
    // Separate from the page's cover photo: the card is a different shape,
    // and a group may want a product close-up there and a room on its page.
    db.exec(`ALTER TABLE categories ADD COLUMN card_image TEXT`);
  },
];

/**
 * Apply pending migrations, one transaction each.
 *
 * Several processes can open the database at once — the build's parallel
 * workers, or the site starting while a seed runs. Each migration takes the
 * write lock first (BEGIN IMMEDIATE) and only then reads the version, so a
 * process that waited for the lock sees the migration another one just
 * applied and skips it, instead of running it twice.
 */
function migrate(db: DatabaseSync): void {
  const version = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

  while (version() < MIGRATIONS.length) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = version();
      if (current < MIGRATIONS.length) {
        const migration = MIGRATIONS[current]!;
        if (typeof migration === 'string') db.exec(migration);
        else migration(db);
        db.exec(`PRAGMA user_version = ${current + 1}`);
      }
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
  // busy_timeout first: until it is set, any statement that meets a lock
  // fails at once instead of waiting — including the journal_mode switch
  // below, which the build's parallel workers all run at the same moment.
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
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
