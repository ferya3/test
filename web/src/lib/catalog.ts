/**
 * The catalogue's vocabulary: the values a product can take on each filter
 * dimension, with their Persian labels.
 *
 * Kept as code rather than tables. These are a factory's fixed product
 * attributes — four decor families, five surfaces, a set of press thicknesses —
 * not something an editor invents, and as code they type-check every query and
 * every form that uses them.
 */

export const FAMILIES = {
  wood: 'چوبی',
  stone: 'سنگی',
  solid: 'تک‌رنگ',
  fabric: 'پارچه‌ای',
} as const;

export const SURFACES = {
  'high-gloss': 'های‌گلاس',
  'super-matte': 'سوپرمات',
  matte: 'مات',
  'semi-matte': 'نیمه‌مات',
  embossed: 'طرح‌دار',
} as const;

/** Millimetres, as the factory quotes them. */
export const THICKNESSES = ['6', '8', '10', '12', '16', '18', '22'] as const;

export type Family = keyof typeof FAMILIES;
export type Surface = keyof typeof SURFACES;
export type Thickness = (typeof THICKNESSES)[number];

export const isFamily = (v: string): v is Family => v in FAMILIES;
export const isSurface = (v: string): v is Surface => v in SURFACES;
export const isThickness = (v: string): v is Thickness =>
  (THICKNESSES as readonly string[]).includes(v);

/** Western digits to Persian, for display only — never for stored values. */
export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}

/** The current year in the Persian (Solar Hijri) calendar. */
export function persianYear(date = new Date()): number {
  return parseInt(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' }).format(date), 10);
}

/* --------------------------------------------------------------------------
   English, and helpers that pick the right language
   -------------------------------------------------------------------------- */

export const FAMILIES_EN: Record<Family, string> = {
  wood: 'Wood',
  stone: 'Stone',
  solid: 'Solid colour',
  fabric: 'Fabric',
};

export const SURFACES_EN: Record<Surface, string> = {
  'high-gloss': 'High-gloss',
  'super-matte': 'Super-matte',
  matte: 'Matte',
  'semi-matte': 'Semi-matte',
  embossed: 'Embossed',
};

type Lang = 'fa' | 'en';

export const familyLabels = (lang: Lang): Record<Family, string> => (lang === 'en' ? FAMILIES_EN : FAMILIES);
export const surfaceLabels = (lang: Lang): Record<Surface, string> => (lang === 'en' ? SURFACES_EN : SURFACES);

/** A number for display: Persian digits on the Persian site, Western on the English one. */
export const num = (value: string | number, lang: Lang) => (lang === 'fa' ? faDigits(value) : String(value));

/** A list for display: «۱۶، ۱۸» in Persian, "16, 18" in English. */
export const list = (values: (string | number)[], lang: Lang) =>
  values.map((v) => num(v, lang)).join(lang === 'fa' ? '، ' : ', ');
