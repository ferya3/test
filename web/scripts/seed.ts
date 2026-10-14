/**
 * Seed the catalogue and the first administrator.
 *
 *   npm run db:seed
 *
 * Idempotent: categories and products are upserted by slug, settings only
 * fill keys that are missing, and an administrator is created only if none
 * exists — so re-running it after an editor has changed things in the admin
 * never overwrites their work, and never resets a password.
 */
import { db, transaction } from '../src/lib/db.ts';
import { generatePassword, hashPassword } from '../src/lib/crypto.ts';
import { SETTING_DEFAULTS } from '../src/lib/queries.ts';

const categories = [
  {
    slug: 'hpl-cabinet-panel',
    name: 'صفحه کابینت اچ‌پی‌ال',
    short: 'ورق HPL پرس‌شده روی هستهٔ MDF، برای بدنه و درب کابینت آشپزخانه و کمد.',
    description:
      'صفحه کابینت اچ‌پی‌ال از پرس ورق High Pressure Laminate روی هستهٔ MDF ساخته می‌شود. سطح سخت و مقاوم در برابر خط و خش و حرارت، و هستهٔ پایدار، آن را برای بدنه و درب کابینت آشپزخانه، کمد دیواری و مبلمان مناسب می‌کند.',
  },
  {
    slug: 'hpl-compact',
    name: 'کامپکت اچ‌پی‌ال',
    short: 'ورق فشردهٔ یکپارچه بدون هستهٔ چوبی؛ خودایستا و مقاوم در برابر رطوبت مستقیم.',
    description:
      'کامپکت اچ‌پی‌ال از لایه‌های کاغذ کرافت آغشته به رزین فنولیک ساخته می‌شود که زیر فشار و حرارت بالا به یک ورق یکپارچه تبدیل می‌شوند. هیچ هستهٔ چوبی ندارد، پس در تماس مستقیم با آب باد نمی‌کند و به قاب یا زیرسازی نیاز ندارد.',
  },
];

const decors: Record<string, [string, 'wood' | 'stone' | 'solid' | 'fabric']> = {
  'plain-white': ['سفید ساده', 'solid'],
  'plain-graphite': ['گرافیتی ساده', 'solid'],
  'carrara-marble': ['مرمر کارارا', 'stone'],
  calacatta: ['کالاکاتا', 'stone'],
  linen: ['کتان', 'fabric'],
  concrete: ['بتن اکسپوز', 'stone'],
  'natural-oak': ['بلوط طبیعی', 'wood'],
  'rustic-oak': ['بلوط روستیک', 'wood'],
  'american-walnut': ['گردو آمریکایی', 'wood'],
  wenge: ['ونگه', 'wood'],
  terrazzo: ['تراتزو', 'stone'],
};

const surfaceFa: Record<string, string> = {
  'high-gloss': 'های‌گلاس',
  'super-matte': 'سوپرمات',
  matte: 'مات',
  'semi-matte': 'نیمه‌مات',
  embossed: 'طرح‌دار',
};

// category, decor, surface, colour
const range: [string, string, string, string][] = [
  ['hpl-cabinet-panel', 'plain-white', 'high-gloss', '#f7f7f5'],
  ['hpl-cabinet-panel', 'plain-graphite', 'high-gloss', '#3a3d40'],
  ['hpl-cabinet-panel', 'carrara-marble', 'high-gloss', '#ecebe6'],
  ['hpl-cabinet-panel', 'calacatta', 'high-gloss', '#efe9df'],
  ['hpl-cabinet-panel', 'plain-white', 'super-matte', '#f1f1ee'],
  ['hpl-cabinet-panel', 'plain-graphite', 'super-matte', '#1d1e1f'],
  ['hpl-cabinet-panel', 'linen', 'super-matte', '#d8cfc2'],
  ['hpl-cabinet-panel', 'concrete', 'super-matte', '#a5a29c'],
  ['hpl-cabinet-panel', 'natural-oak', 'embossed', '#c49a6c'],
  ['hpl-cabinet-panel', 'rustic-oak', 'embossed', '#a87d50'],
  ['hpl-cabinet-panel', 'american-walnut', 'matte', '#6b4a33'],
  ['hpl-cabinet-panel', 'wenge', 'matte', '#3d2a1e'],
  ['hpl-compact', 'plain-white', 'matte', '#f4f4f1'],
  ['hpl-compact', 'plain-graphite', 'matte', '#3a3d40'],
  ['hpl-compact', 'plain-graphite', 'super-matte', '#1a1b1c'],
  ['hpl-compact', 'natural-oak', 'matte', '#c49a6c'],
  ['hpl-compact', 'american-walnut', 'semi-matte', '#6b4a33'],
  ['hpl-compact', 'concrete', 'matte', '#a5a29c'],
  ['hpl-compact', 'terrazzo', 'semi-matte', '#bfb8ac'],
  ['hpl-compact', 'carrara-marble', 'semi-matte', '#ecebe6'],
  ['hpl-compact', 'linen', 'matte', '#d8cfc2'],
  ['hpl-compact', 'linen', 'super-matte', '#2f4438'],
];

// Three from each group, and across the decor families — the homepage should
// show the range, not a row of white doors.
const FEATURED = new Set([2, 8, 10, 15, 18, 21]);

async function main(): Promise<void> {
  transaction(() => {
    const upsertCategory = db.prepare(`
      INSERT INTO categories (slug, name, short, description, position)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name, short = excluded.short,
        description = excluded.description, position = excluded.position
    `);

    categories.forEach((c, i) => upsertCategory.run(c.slug, c.name, c.short, c.description, i));

    const categoryIds = Object.fromEntries(
      (db.prepare('SELECT id, slug FROM categories').all() as { id: number; slug: string }[]).map((r) => [
        r.slug,
        r.id,
      ]),
    );

    // Upserted by slug but only on insert: an existing product keeps whatever
    // an editor has since changed in the admin.
    const insertProduct = db.prepare(`
      INSERT INTO products
        (slug, code, category_id, name, short, description, family, surface,
         thicknesses, color_hex, is_featured, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO NOTHING
    `);

    range.forEach(([category, decor, surface, hex], index) => {
      const [decorFa, family] = decors[decor]!;
      const compact = category === 'hpl-compact';
      const kind = compact ? 'ورق کامپکت' : 'صفحه کابینت';
      const token = compact ? 'compact' : 'cabinet';

      insertProduct.run(
        `${decor}-${surface}-${token}`,
        `AG-${1001 + index}`,
        categoryIds[category]!,
        `${kind} ${surfaceFa[surface]} ${decorFa}`,
        compact
          ? `ورق کامپکت یکپارچهٔ ${surfaceFa[surface]} با طرح ${decorFa}؛ خودایستا و مقاوم در برابر آب.`
          : `صفحه کابینت ${surfaceFa[surface]} با روکش HPL طرح ${decorFa} روی هستهٔ MDF.`,
        compact
          ? `ورق کامپکت اچ‌پی‌ال با روکش ${decorFa} و سطح ${surfaceFa[surface]}. چون هستهٔ چوبی ندارد، در تماس مستقیم با آب باد نمی‌کند و بدون قاب یا زیرسازی قابل نصب است. لبه‌ها پس از برش قابل پولیش‌اند.`
          : `صفحه کابینت با روکش اچ‌پی‌ال ${decorFa} و سطح ${surfaceFa[surface]} روی هستهٔ MDF. پرس گرم و چسب مقاوم به رطوبت، پایداری ابعادی و دوام سطح را تضمین می‌کند.`,
        family,
        surface,
        compact ? '6,8,10,12' : '16,18,22',
        hex,
        FEATURED.has(index) ? 1 : 0,
        index,
      );
    });

    // Settings fill only what is missing — an edited intro survives a re-seed.
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
      insertSetting.run(key, value);
    }
  });

  const counts = db
    .prepare('SELECT (SELECT COUNT(*) FROM categories) AS c, (SELECT COUNT(*) FROM products) AS p')
    .get() as { c: number; p: number };
  console.log(`catalogue: ${counts.c} categories, ${counts.p} products`);

  // An administrator only if there is none. The password is generated, shown
  // once, and never stored anywhere but as a scrypt hash — a seed must never
  // bake a known password into a deployable artefact.
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };

  if (existing.n === 0) {
    const email = process.env.ADMIN_EMAIL ?? 'admin@artavilgold.ir';
    const password = process.env.ADMIN_PASSWORD ?? generatePassword();

    db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(
      email,
      'مدیر سایت',
      await hashPassword(password),
    );

    console.log('\nadministrator created — store this now, it is not shown again:');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : password}`);
  } else {
    console.log('administrator already exists — left untouched');
  }
}

await main();
