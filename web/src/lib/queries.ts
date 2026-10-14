/**
 * Typed reads for the public site.
 *
 * Every query here is a prepared statement with bound parameters — no string
 * concatenation of anything a visitor supplied, which is the whole of the SQL
 * injection defence and the only one that holds.
 *
 * Reads that feed the site take a language. Text columns have an English twin
 * (`name_en`, …); for English the twin is used, falling back to the Persian
 * when it has not been filled in yet, so a page is never blank.
 */
import { db } from './db.ts';
import { THICKNESSES, familyLabels, num, surfaceLabels, type Family, type Surface, type Thickness } from './catalog.ts';

export type Lang = 'fa' | 'en';

export type Category = {
  id: number;
  slug: string;
  name: string;
  short: string;
  description: string;
  name_en: string;
  short_en: string;
  description_en: string;
  position: number;
  is_active: number;
};

export type Product = {
  id: number;
  slug: string;
  code: string;
  category_id: number;
  name: string;
  short: string;
  description: string;
  name_en: string;
  short_en: string;
  description_en: string;
  family: Family;
  surface: Surface;
  thicknesses: string;
  color_hex: string;
  image: string | null;
  is_featured: number;
  is_active: number;
  position: number;
  created_at: string;
};

export type ProductWithCategory = Product & { category_slug: string; category_name: string };

export type Filters = {
  families: Family[];
  surfaces: Surface[];
  thicknesses: Thickness[];
};

export const NO_FILTERS: Filters = { families: [], surfaces: [], thicknesses: [] };

/*
 * Rows come back from node:sqlite with a null prototype, which React will not
 * pass from a server component to a client one; every row is copied into an
 * ordinary object on the way out, and its text put in the right language.
 */
function localize<T>(row: unknown, lang: Lang, fields: string[]): T {
  const out: Record<string, unknown> = { ...(row as object) };
  if (lang === 'en') {
    for (const f of fields) {
      const en = out[`${f}_en`];
      if (typeof en === 'string' && en.trim() !== '') out[f] = en;
    }
  }
  return out as T;
}

const many = <T,>(rows: unknown[], lang: Lang, fields: string[]) => rows.map((r) => localize<T>(r, lang, fields));
const one = <T,>(row: unknown, lang: Lang, fields: string[]) => (row ? localize<T>(row, lang, fields) : undefined);

const CATEGORY_TEXT = ['name', 'short', 'description'];
const PRODUCT_TEXT = ['name', 'short', 'description', 'category_name'];

export function getCategories(lang: Lang = 'fa'): Category[] {
  return many<Category>(db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY position, id').all(), lang, CATEGORY_TEXT);
}

export function getCategory(slug: string, lang: Lang = 'fa'): Category | undefined {
  return one<Category>(db.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').get(slug), lang, CATEGORY_TEXT);
}

/**
 * The WHERE clause for a filter set, optionally leaving one dimension out —
 * which is how facet counts are taken (see `getFacets`).
 */
function where(categoryId: number, filters: Filters, omit?: keyof Filters) {
  const clauses = ['p.is_active = 1', 'p.category_id = ?'];
  const params: (string | number)[] = [categoryId];

  if (omit !== 'families' && filters.families.length > 0) {
    clauses.push(`p.family IN (${filters.families.map(() => '?').join(',')})`);
    params.push(...filters.families);
  }

  if (omit !== 'surfaces' && filters.surfaces.length > 0) {
    clauses.push(`p.surface IN (${filters.surfaces.map(() => '?').join(',')})`);
    params.push(...filters.surfaces);
  }

  if (omit !== 'thicknesses' && filters.thicknesses.length > 0) {
    // Thicknesses are a comma list; wrapping both sides in commas makes "1"
    // unable to match "16".
    clauses.push(
      `(${filters.thicknesses.map(() => `(',' || p.thicknesses || ',') LIKE ?`).join(' OR ')})`,
    );
    params.push(...filters.thicknesses.map((t) => `%,${t},%`));
  }

  return { sql: clauses.join(' AND '), params };
}

export function getProducts(categoryId: number, filters: Filters, lang: Lang = 'fa'): Product[] {
  const { sql, params } = where(categoryId, filters);

  return many<Product>(
    db.prepare(`SELECT p.* FROM products p WHERE ${sql} ORDER BY p.position, p.id`).all(...params),
    lang,
    PRODUCT_TEXT,
  );
}

export type Facets = {
  families: Record<string, number>;
  surfaces: Record<string, number>;
  thicknesses: Record<string, number>;
};

/**
 * How many products each option would show.
 *
 * Each dimension is counted against every *other* active filter but not its
 * own. Otherwise choosing "wood" would zero every other family's count and the
 * visitor could never widen to "wood or stone" — the option they want would
 * read as empty and be hidden.
 */
export function getFacets(categoryId: number, filters: Filters): Facets {
  const count = (column: 'family' | 'surface', omit: keyof Filters) => {
    const { sql, params } = where(categoryId, filters, omit);
    const rows = db
      .prepare(`SELECT p.${column} AS v, COUNT(*) AS n FROM products p WHERE ${sql} GROUP BY p.${column}`)
      .all(...params) as { v: string; n: number }[];

    return Object.fromEntries(rows.map((r) => [r.v, r.n]));
  };

  const { sql, params } = where(categoryId, filters, 'thicknesses');
  const thicknessRows = db
    .prepare(`SELECT p.thicknesses AS v FROM products p WHERE ${sql}`)
    .all(...params) as { v: string }[];

  const thicknesses: Record<string, number> = {};
  for (const { v } of thicknessRows) {
    for (const t of v.split(',').filter(Boolean)) {
      thicknesses[t] = (thicknesses[t] ?? 0) + 1;
    }
  }

  return {
    families: count('family', 'families'),
    surfaces: count('surface', 'surfaces'),
    thicknesses,
  };
}

const WITH_CATEGORY = `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.name_en AS category_name_en
                         FROM products p JOIN categories c ON c.id = p.category_id`;

export function getFeaturedProducts(limit: number, lang: Lang = 'fa'): ProductWithCategory[] {
  return many<ProductWithCategory>(
    db
      .prepare(
        `${WITH_CATEGORY}
          WHERE p.is_active = 1 AND p.is_featured = 1 AND c.is_active = 1
          ORDER BY p.position, p.id LIMIT ?`,
      )
      .all(limit),
    lang,
    PRODUCT_TEXT,
  );
}

export function getProduct(slug: string, lang: Lang = 'fa'): ProductWithCategory | undefined {
  return one<ProductWithCategory>(
    db.prepare(`${WITH_CATEGORY} WHERE p.slug = ? AND p.is_active = 1 AND c.is_active = 1`).get(slug),
    lang,
    PRODUCT_TEXT,
  );
}

export function getRelated(product: Product, limit: number, lang: Lang = 'fa'): Product[] {
  return many<Product>(
    db
      .prepare(
        `SELECT * FROM products
          WHERE category_id = ? AND id != ? AND is_active = 1
          ORDER BY (family = ?) DESC, position LIMIT ?`,
      )
      .all(product.category_id, product.id, product.family, limit),
    lang,
    PRODUCT_TEXT,
  );
}

export type CategoryWithStats = Category & { product_count: number; swatches: string[] };

/** Categories for the home page cards: how many products, and a few colours to show. */
export function getCategoriesWithStats(lang: Lang = 'fa'): CategoryWithStats[] {
  const swatches = db.prepare(
    'SELECT color_hex FROM products WHERE category_id = ? AND is_active = 1 ORDER BY is_featured DESC, position LIMIT 5',
  );
  const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? AND is_active = 1');

  return getCategories(lang).map((c) => ({
    ...c,
    product_count: (count.get(c.id) as { n: number }).n,
    swatches: (swatches.all(c.id) as { color_hex: string }[]).map((r) => r.color_hex),
  }));
}

export function countProducts(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_active = 1').get() as { n: number }).n;
}

/* --------------------------------------------------------------------------
   Production steps and projects
   -------------------------------------------------------------------------- */

export type ProcessStep = {
  id: number;
  position: number;
  title: string;
  body: string;
  title_en: string;
  body_en: string;
  image: string | null;
};

export function getProcessSteps(lang: Lang = 'fa'): ProcessStep[] {
  return many<ProcessStep>(db.prepare('SELECT * FROM process_steps ORDER BY position, id').all(), lang, ['title', 'body']);
}

export type Project = {
  id: number;
  title: string;
  location: string;
  year: string;
  description: string;
  category_id: number | null;
  color_hex: string;
  image: string | null;
  position: number;
  is_active: number;
  category_slug: string | null;
  category_name: string | null;
};

/** Active projects, optionally only one product group's, in editor order. */
export function getProjects({
  limit = 100,
  categorySlug,
  lang = 'fa',
}: { limit?: number; categorySlug?: string; lang?: Lang } = {}): Project[] {
  return many<Project>(
    db
      .prepare(
        `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.name_en AS category_name_en
           FROM projects p LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.is_active = 1 AND (? IS NULL OR c.slug = ?)
          ORDER BY p.position, p.id LIMIT ?`,
      )
      .all(categorySlug ?? null, categorySlug ?? null, limit),
    lang,
    ['title', 'location', 'description', 'category_name'],
  );
}

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

export const SETTING_DEFAULTS = {
  company_name: 'آرتاویل گلد',
  company_tagline: 'تولیدکنندهٔ صفحه کابینت اچ‌پی‌ال و ورق کامپکت',
  founded_year: '1375',
  hero_overline: 'تولیدکنندهٔ ورق اچ‌پی‌ال',
  hero_title: 'سطحی که سال‌ها زیبا می‌ماند',
  hero_lead:
    'صفحه کابینت و کامپکت اچ‌پی‌ال با پرس فشار بالا؛ مقاوم در برابر خط و خش، حرارت و رطوبت، در طرح‌های چوبی، سنگی و تک‌رنگ.',
  intro_overline: 'دربارهٔ کارخانه',
  intro_heading: 'ورق اچ‌پی‌ال، از پرس تا برش نهایی',
  intro_body:
    'ما ورق اچ‌پی‌ال تولید می‌کنیم: لایه‌های کاغذ کرافت آغشته به رزین که زیر فشار و حرارت بالا به یک سطح یکپارچه و مقاوم تبدیل می‌شوند. همین یک فرآیند، پایهٔ هر دو گروه کالای ماست.\n\nخط تولید تمام‌اتوماتیک، آزمایشگاه کنترل کیفیت داخلی و انبار دائمی ورق به ما اجازه می‌دهد سفارش‌های کارگاهی و پروژه‌های بزرگ را با همان ثبات رنگ و ضخامت تحویل بدهیم.',
  contact_phone: '021-12345678',
  contact_email: 'info@artavilgold.ir',
  contact_address: 'تهران، شهرک صنعتی، کیلومتر ۲۵ جاده مخصوص',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

/**
 * The settings that are text, and so have an English version, stored under
 * `<key>_en`. Phone, email and founding year are the same in both languages.
 */
export const TRANSLATED_SETTINGS = [
  'company_name',
  'company_tagline',
  'hero_overline',
  'hero_title',
  'hero_lead',
  'intro_overline',
  'intro_heading',
  'intro_body',
  'contact_address',
] as const satisfies readonly SettingKey[];

export type TranslatedSettingKey = (typeof TRANSLATED_SETTINGS)[number];

export const SETTING_DEFAULTS_EN: Record<TranslatedSettingKey, string> = {
  company_name: 'Artavil Gold',
  company_tagline: 'Manufacturer of HPL cabinet panels and compact sheet',
  hero_overline: 'HPL laminate manufacturer',
  hero_title: 'Surfaces that stay beautiful for years',
  hero_lead:
    'High-pressure HPL cabinet panels and compact sheet: resistant to scratches, heat and moisture, in wood, stone and solid-colour designs.',
  intro_overline: 'About the factory',
  intro_heading: 'HPL sheet, from press to final cut',
  intro_body:
    'We make HPL: layers of kraft paper impregnated with resin, fused under high pressure and heat into one hard, solid surface. That one process is the basis of both our product lines.\n\nA fully automated line, an in-house quality lab and permanent stock let us deliver workshop orders and large projects with the same consistency of colour and thickness.',
  contact_address: 'Km 25, Makhsous Road, Industrial Park, Tehran',
};

export function getSettings(lang: Lang = 'fa'): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings = { ...SETTING_DEFAULTS, ...stored } as Settings;

  if (lang === 'en') {
    for (const key of TRANSLATED_SETTINGS) {
      const en = stored[`${key}_en`];
      settings[key] = en && en.trim() !== '' ? en : SETTING_DEFAULTS_EN[key];
    }
  }

  return settings;
}

/** The three filter dropdowns, in the order they are offered, labelled for `lang`. */
export function filterGroups(lang: Lang) {
  const mm = lang === 'en' ? 'mm' : 'میلی‌متر';
  return [
    { key: 'families', param: 'family', options: Object.entries(familyLabels(lang)) },
    { key: 'surfaces', param: 'surface', options: Object.entries(surfaceLabels(lang)) },
    { key: 'thicknesses', param: 'thickness', options: THICKNESSES.map((t) => [t, `${num(t, lang)} ${mm}`] as [string, string]) },
  ] as const;
}
