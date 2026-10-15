/**
 * The three product attributes — decor family (طرح), surface (سطح) and
 * thickness (ضخامت) — as edited in the admin.
 *
 * Products store an attribute's `value`; the label shown depends on the
 * language. Read on every request: a few dozen rows, and an edit in the admin
 * shows on the site at once.
 */
import { cache } from 'react';
import { db } from './db.ts';
import { num, type Texture } from './catalog.ts';

export type AttributeKind = 'family' | 'surface' | 'thickness';
export const ATTRIBUTE_KINDS: AttributeKind[] = ['family', 'surface', 'thickness'];

export type Attribute = {
  id: number;
  kind: AttributeKind;
  value: string;
  name: string;
  name_en: string;
  texture: Texture;
  position: number;
};

type Lang = 'fa' | 'en';

export function getAttributes(kind?: AttributeKind): Attribute[] {
  const rows = kind
    ? db.prepare('SELECT * FROM attributes WHERE kind = ? ORDER BY position, id').all(kind)
    : db.prepare('SELECT * FROM attributes ORDER BY kind, position, id').all();
  return rows.map((r) => ({ ...(r as object) })) as Attribute[];
}

/**
 * Which of the three attributes the public site shows, switched in the admin
 * (stored in settings as `attr_show_<kind>`; on unless set to '0'). A hidden
 * one disappears from filters, product cards and product pages, and becomes
 * optional in the product form. Products keep their values, so switching it
 * back on restores everything.
 */
export function attributeVisibility(): Record<AttributeKind, boolean> {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'attr_show_%'").all() as { key: string; value: string }[];
  const off = new Set(rows.filter((r) => r.value === '0').map((r) => r.key));
  return {
    family: !off.has('attr_show_family'),
    surface: !off.has('attr_show_surface'),
    thickness: !off.has('attr_show_thickness'),
  };
}

/** Thicknesses sort by their number, not as text: 6, 8, 10 — not 10, 6, 8. */
const byNumber = (a: string, b: string) => Number(a) - Number(b);

/** Everything a page needs to label and draw products, in one read. */
export function attributeCatalog(lang: Lang) {
  const all = getAttributes();
  const of = (kind: AttributeKind) => all.filter((a) => a.kind === kind);
  const label = (a: Attribute) => (lang === 'en' && a.name_en.trim() ? a.name_en : a.name);
  const mm = lang === 'en' ? 'mm' : 'میلی‌متر';

  const families = of('family');
  const surfaces = of('surface');
  const thicknesses = of('thickness').sort((a, b) => byNumber(a.value, b.value));

  const familyLabel = Object.fromEntries(families.map((a) => [a.value, label(a)]));
  const surfaceLabel = Object.fromEntries(surfaces.map((a) => [a.value, label(a)]));
  const texture = Object.fromEntries(families.map((a) => [a.value, a.texture])) as Record<string, Texture>;
  const show = attributeVisibility();

  return {
    show,
    // An unknown value (an attribute deleted after the fact) shows as itself
    // rather than as nothing.
    family: (v: string) => familyLabel[v] ?? v,
    surface: (v: string) => surfaceLabel[v] ?? v,
    texture: (family: string): Texture => texture[family] ?? 'solid',
    /** The filter dropdowns that are switched on, in order, as [value, label] options. */
    filterGroups: ([
      { key: 'families', param: 'family', options: families.map((a) => [a.value, label(a)] as [string, string]) },
      { key: 'surfaces', param: 'surface', options: surfaces.map((a) => [a.value, label(a)] as [string, string]) },
      {
        key: 'thicknesses',
        param: 'thickness',
        options: thicknesses.map((a) => [a.value, `${num(a.value, lang)} ${mm}`] as [string, string]),
      },
    ] as const).filter((g) => show[KIND_OF[g.key]]),
    values: {
      families: new Set(families.map((a) => a.value)),
      surfaces: new Set(surfaces.map((a) => a.value)),
      thicknesses: new Set(thicknesses.map((a) => a.value)),
    },
    thicknessOrder: thicknesses.map((a) => a.value),
  };
}

export type AttributeCatalog = ReturnType<typeof attributeCatalog>;

const KIND_OF = { families: 'family', surfaces: 'surface', thicknesses: 'thickness' } as const;

/** The same, read once per request however many product cards ask for it. */
export const catalogFor = cache((lang: Lang) => attributeCatalog(lang));

/** How many products use an attribute value — an attribute in use cannot be deleted. */
export function attributeUsage(kind: AttributeKind, value: string): number {
  const row =
    kind === 'thickness'
      ? db.prepare("SELECT COUNT(*) AS n FROM products WHERE (',' || thicknesses || ',') LIKE ?").get(`%,${value},%`)
      : db.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${kind} = ?`).get(value);
  return (row as { n: number }).n;
}
