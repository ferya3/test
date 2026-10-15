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
import { getDictionary } from '../i18n/dictionaries.ts';

// The built-in wording of the home page sections, the defaults of their settings.
const DICT_FA = getDictionary('fa');
const DICT_EN = getDictionary('en');

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
  /** Photo behind the heading of the group's page, or null. */
  image: string | null;
  /** Photo on the group's card on the home page; null draws its colours instead. */
  card_image: string | null;
  /** The drawing that stands in for a project photo in this group. */
  scene: 'kitchen' | 'cubicles';
  /** Search-result title and description; empty means worked out from the content. */
  seo_title: string;
  seo_description: string;
  seo_title_en: string;
  seo_description_en: string;
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
  family: string;
  surface: string;
  thicknesses: string;
  color_hex: string;
  image: string | null;
  is_featured: number;
  is_active: number;
  position: number;
  created_at: string;
  seo_title: string;
  seo_description: string;
  seo_title_en: string;
  seo_description_en: string;
};

export type ProductWithCategory = Product & { category_slug: string; category_name: string };

export type Filters = {
  families: string[];
  surfaces: string[];
  thicknesses: string[];
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
      // A Persian search title is no fallback on an English page: empty
      // instead, so the page works one out from its English content.
      else if (f.startsWith('seo_')) out[f] = '';
    }
  }
  return out as T;
}

const many = <T,>(rows: unknown[], lang: Lang, fields: string[]) => rows.map((r) => localize<T>(r, lang, fields));
const one = <T,>(row: unknown, lang: Lang, fields: string[]) => (row ? localize<T>(row, lang, fields) : undefined);

const CATEGORY_TEXT = ['name', 'short', 'description', 'seo_title', 'seo_description'];
const PRODUCT_TEXT = ['name', 'short', 'description', 'category_name', 'seo_title', 'seo_description'];

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
  category_scene: 'kitchen' | 'cubicles' | null;
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
        `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.name_en AS category_name_en,
                c.scene AS category_scene
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
  hero_cta_label: 'مشاهدهٔ محصولات',
  // Where the main button goes: a site path; empty means the first product group.
  hero_cta_href: '',
  hero_show_phone: '1',
  // A background photo (stored image name); empty shows the 3D sheets instead.
  hero_image: '',
  intro_overline: 'دربارهٔ کارخانه',
  intro_heading: 'ورق اچ‌پی‌ال، از پرس تا برش نهایی',
  intro_body:
    'ما ورق اچ‌پی‌ال تولید می‌کنیم: لایه‌های کاغذ کرافت آغشته به رزین که زیر فشار و حرارت بالا به یک سطح یکپارچه و مقاوم تبدیل می‌شوند. همین یک فرآیند، پایهٔ هر دو گروه کالای ماست.\n\nخط تولید تمام‌اتوماتیک، آزمایشگاه کنترل کیفیت داخلی و انبار دائمی ورق به ما اجازه می‌دهد سفارش‌های کارگاهی و پروژه‌های بزرگ را با همان ثبات رنگ و ضخامت تحویل بدهیم.',
  contact_phone: '021-12345678',
  contact_email: 'info@artavilgold.ir',
  contact_address: 'تهران، شهرک صنعتی، کیلومتر ۲۵ جاده مخصوص',
  // The home page in search results: its title and the line under it.
  seo_home_title: 'صفحه کابینت و کامپکت اچ‌پی‌ال | آرتاویل گلد',
  seo_home_description:
    'آرتاویل گلد، تولیدکنندهٔ صفحه کابینت اچ‌پی‌ال و ورق کامپکت در طرح‌های چوبی، سنگی و تک‌رنگ؛ مقاوم در برابر خط و خش، حرارت و رطوبت. استعلام قیمت و نمونهٔ رنگ.',
  // The code Google Search Console gives for the "HTML tag" verification method.
  google_site_verification: '',
  // Brand: uploaded logo (light backgrounds), a version for the dark footer,
  // the square site icon, and whether the name is written beside the logo.
  logo: '',
  logo_dark: '',
  site_icon: '',
  brand_show_name: '1',
  // Home page sections below the hero: headings, and whether each is shown.
  home_groups_overline: DICT_FA.groups.overline,
  home_groups_title: DICT_FA.groups.title,
  home_process_overline: DICT_FA.process.overline,
  home_process_title: DICT_FA.process.title,
  home_featured_overline: DICT_FA.featured.overline,
  home_featured_title: DICT_FA.featured.title,
  home_featured_lead: DICT_FA.featured.lead,
  home_projects_overline: DICT_FA.projects.overline,
  home_projects_title: DICT_FA.projects.title,
  home_projects_lead: DICT_FA.projects.lead,
  // Words between *stars* are written in gold.
  home_cta_title: `${DICT_FA.cta.titleA} *${DICT_FA.cta.titleGold}* ${DICT_FA.cta.titleB}`,
  home_cta_lead: DICT_FA.cta.lead,
  home_show_intro: '1',
  home_show_groups: '1',
  home_show_process: '1',
  home_show_featured: '1',
  home_show_projects: '1',
  home_show_cta: '1',
  home_featured_count: '6',
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
  'hero_cta_label',
  'intro_overline',
  'intro_heading',
  'intro_body',
  'contact_address',
  'seo_home_title',
  'seo_home_description',
  'home_groups_overline',
  'home_groups_title',
  'home_process_overline',
  'home_process_title',
  'home_featured_overline',
  'home_featured_title',
  'home_featured_lead',
  'home_projects_overline',
  'home_projects_title',
  'home_projects_lead',
  'home_cta_title',
  'home_cta_lead',
] as const satisfies readonly SettingKey[];

export type TranslatedSettingKey = (typeof TRANSLATED_SETTINGS)[number];

export const SETTING_DEFAULTS_EN: Record<TranslatedSettingKey, string> = {
  company_name: 'Artavil Gold',
  company_tagline: 'Manufacturer of HPL cabinet panels and compact sheet',
  hero_overline: 'HPL laminate manufacturer',
  hero_title: 'Surfaces that stay beautiful for years',
  hero_lead:
    'High-pressure HPL cabinet panels and compact sheet: resistant to scratches, heat and moisture, in wood, stone and solid-colour designs.',
  hero_cta_label: 'View products',
  intro_overline: 'About the factory',
  intro_heading: 'HPL sheet, from press to final cut',
  intro_body:
    'We make HPL: layers of kraft paper impregnated with resin, fused under high pressure and heat into one hard, solid surface. That one process is the basis of both our product lines.\n\nA fully automated line, an in-house quality lab and permanent stock let us deliver workshop orders and large projects with the same consistency of colour and thickness.',
  contact_address: 'Km 25, Makhsous Road, Industrial Park, Tehran',
  seo_home_title: 'HPL Cabinet Panels & Compact Sheet | Artavil Gold',
  seo_home_description:
    'Artavil Gold makes HPL cabinet panels and compact sheet in wood, stone and solid-colour designs: scratch, heat and moisture resistant. Ask for prices and samples.',
  home_groups_overline: DICT_EN.groups.overline,
  home_groups_title: DICT_EN.groups.title,
  home_process_overline: DICT_EN.process.overline,
  home_process_title: DICT_EN.process.title,
  home_featured_overline: DICT_EN.featured.overline,
  home_featured_title: DICT_EN.featured.title,
  home_featured_lead: DICT_EN.featured.lead,
  home_projects_overline: DICT_EN.projects.overline,
  home_projects_title: DICT_EN.projects.title,
  home_projects_lead: DICT_EN.projects.lead,
  home_cta_title: `${DICT_EN.cta.titleA} *${DICT_EN.cta.titleGold}* ${DICT_EN.cta.titleB}`,
  home_cta_lead: DICT_EN.cta.lead,
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
