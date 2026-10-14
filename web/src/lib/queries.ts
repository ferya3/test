/**
 * Typed reads for the public site.
 *
 * Every query here is a prepared statement with bound parameters — no string
 * concatenation of anything a visitor supplied, which is the whole of the SQL
 * injection defence and the only one that holds.
 */
import { db } from './db.ts';
import { FAMILIES, SURFACES, THICKNESSES, type Family, type Surface, type Thickness } from './catalog.ts';

export type Category = {
  id: number;
  slug: string;
  name: string;
  short: string;
  description: string;
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

export function getCategories(): Category[] {
  return db
    .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY position, id')
    .all() as Category[];
}

export function getCategory(slug: string): Category | undefined {
  return db
    .prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1')
    .get(slug) as Category | undefined;
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

export function getProducts(categoryId: number, filters: Filters): Product[] {
  const { sql, params } = where(categoryId, filters);

  return db
    .prepare(`SELECT p.* FROM products p WHERE ${sql} ORDER BY p.position, p.id`)
    .all(...params) as Product[];
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

export function getFeaturedProducts(limit: number): ProductWithCategory[] {
  return db
    .prepare(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 AND p.is_featured = 1 AND c.is_active = 1
        ORDER BY p.position, p.id LIMIT ?`,
    )
    .all(limit) as ProductWithCategory[];
}

export function getProduct(slug: string): ProductWithCategory | undefined {
  return db
    .prepare(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.is_active = 1 AND c.is_active = 1`,
    )
    .get(slug) as ProductWithCategory | undefined;
}

export function getRelated(product: Product, limit: number): Product[] {
  return db
    .prepare(
      `SELECT * FROM products
        WHERE category_id = ? AND id != ? AND is_active = 1
        ORDER BY (family = ?) DESC, position LIMIT ?`,
    )
    .all(product.category_id, product.id, product.family, limit) as Product[];
}

export type CategoryWithStats = Category & { product_count: number; swatches: string[] };

/** Categories for the home page cards: how many products, and a few colours to show. */
export function getCategoriesWithStats(): CategoryWithStats[] {
  const swatches = db.prepare(
    'SELECT color_hex FROM products WHERE category_id = ? AND is_active = 1 ORDER BY is_featured DESC, position LIMIT 5',
  );
  const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? AND is_active = 1');

  return getCategories().map((c) => ({
    ...c,
    product_count: (count.get(c.id) as { n: number }).n,
    swatches: (swatches.all(c.id) as { color_hex: string }[]).map((r) => r.color_hex),
  }));
}

export function countProducts(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_active = 1').get() as { n: number }).n;
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

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return { ...SETTING_DEFAULTS, ...stored } as Settings;
}

/** Labels for filter options, in the order they should be offered. */
export const FILTER_GROUPS = [
  { key: 'families', param: 'family', label: 'طرح', options: Object.entries(FAMILIES) },
  { key: 'surfaces', param: 'surface', label: 'سطح', options: Object.entries(SURFACES) },
  {
    key: 'thicknesses',
    param: 'thickness',
    label: 'ضخامت',
    options: THICKNESSES.map((t) => [t, `${t} میلی‌متر`] as [string, string]),
  },
] as const;
