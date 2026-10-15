/**
 * Catalogue formatting helpers, and the starting values for the three
 * product attributes (decor family, surface, thickness).
 *
 * The attributes themselves live in the `attributes` table and are edited in
 * the admin (see src/lib/attributes.ts). The lists below are only what
 * migration 5 puts there the first time.
 */

/**
 * How a decor family's swatch is drawn when a product has no photograph.
 * A new decor added in the admin picks one of these.
 */
export const TEXTURES = {
  wood: 'رگه‌های چوب',
  stone: 'رگه‌های سنگ',
  solid: 'ساده',
  fabric: 'بافت پارچه',
} as const;

export type Texture = keyof typeof TEXTURES;
export const isTexture = (v: string): v is Texture => v in TEXTURES;

/** The attributes the site started with: [value, Persian, English, texture]. */
export const DEFAULT_ATTRIBUTES = {
  family: [
    ['wood', 'چوبی', 'Wood', 'wood'],
    ['stone', 'سنگی', 'Stone', 'stone'],
    ['solid', 'تک‌رنگ', 'Solid colour', 'solid'],
    ['fabric', 'پارچه‌ای', 'Fabric', 'fabric'],
  ],
  surface: [
    ['high-gloss', 'های‌گلاس', 'High-gloss', 'solid'],
    ['super-matte', 'سوپرمات', 'Super-matte', 'solid'],
    ['matte', 'مات', 'Matte', 'solid'],
    ['semi-matte', 'نیمه‌مات', 'Semi-matte', 'solid'],
    ['embossed', 'طرح‌دار', 'Embossed', 'solid'],
  ],
  thickness: ['6', '8', '10', '12', '16', '18', '22'].map((t) => [t, t, t, 'solid']),
} as const;

/** Western digits to Persian, for display only — never for stored values. */
export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}

/** The current year in the Persian (Solar Hijri) calendar. */
export function persianYear(date = new Date()): number {
  return parseInt(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' }).format(date), 10);
}

type Lang = 'fa' | 'en';

/** A number for display: Persian digits on the Persian site, Western on the English one. */
export const num = (value: string | number, lang: Lang) => (lang === 'fa' ? faDigits(value) : String(value));

/** A list for display: «۱۶، ۱۸» in Persian, "16, 18" in English. */
export const list = (values: (string | number)[], lang: Lang) =>
  values.map((v) => num(v, lang)).join(lang === 'fa' ? '، ' : ', ');
