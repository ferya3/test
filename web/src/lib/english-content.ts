/**
 * English text for the content the site starts with: the two product
 * groups, the seeded product range, the production steps and the starter
 * projects. Used by migration 4 (for databases that already exist) and by
 * the seed script (for new ones). Anything an editor adds later gets its
 * English in the admin.
 *
 * Relative imports only — this runs under `node --experimental-strip-types`.
 */

export const CATEGORY_EN: Record<string, { name: string; short: string; description: string }> = {
  'hpl-cabinet-panel': {
    name: 'HPL Cabinet Panel',
    short: 'HPL laminate pressed onto an MDF core, for kitchen cabinet carcasses and doors, and wardrobes.',
    description:
      'HPL cabinet panels are made by pressing High Pressure Laminate onto an MDF core. A hard surface that stands up to scratches and heat, on a stable core, makes them right for kitchen cabinet carcasses and doors, built-in wardrobes and furniture.',
  },
  'hpl-compact': {
    name: 'HPL Compact',
    short: 'A solid, compressed sheet with no wood core: self-supporting and unaffected by direct moisture.',
    description:
      'HPL compact is made from layers of kraft paper impregnated with phenolic resin, pressed under high pressure and heat into one solid sheet. With no wood core it does not swell in direct contact with water, and needs no frame or substrate.',
  },
};

const DECOR_EN: Record<string, string> = {
  'plain-white': 'Plain White',
  'plain-graphite': 'Plain Graphite',
  'carrara-marble': 'Carrara Marble',
  calacatta: 'Calacatta',
  linen: 'Linen',
  concrete: 'Exposed Concrete',
  'natural-oak': 'Natural Oak',
  'rustic-oak': 'Rustic Oak',
  'american-walnut': 'American Walnut',
  wenge: 'Wenge',
  terrazzo: 'Terrazzo',
};

const SURFACE_EN: Record<string, string> = {
  'high-gloss': 'High-Gloss',
  'super-matte': 'Super-Matte',
  matte: 'Matte',
  'semi-matte': 'Semi-Matte',
  embossed: 'Embossed',
};

/**
 * English for a seeded product, worked out from its slug
 * (`<decor>-<surface>-<cabinet|compact>`), or null for anything else.
 */
export function productEnglish(slug: string): { name: string; short: string; description: string } | null {
  const match = slug.match(/^(.+)-(high-gloss|super-matte|semi-matte|matte|embossed)-(cabinet|compact)$/);
  if (!match) return null;

  const [, decorKey, surfaceKey, kind] = match;
  const decor = DECOR_EN[decorKey!];
  const surface = SURFACE_EN[surfaceKey!];
  if (!decor || !surface) return null;

  // "a matte surface", but "an embossed surface".
  const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

  return kind === 'compact'
    ? {
        name: `${decor} ${surface} Compact Sheet`,
        short: `Solid ${surface.toLowerCase()} compact sheet in ${decor}; self-supporting and waterproof.`,
        description: `HPL compact sheet with ${a(decor)} decor and ${a(surface.toLowerCase())} surface. With no wood core it does not swell in direct contact with water, and installs without a frame or substrate. Edges can be polished after cutting.`,
      }
    : {
        name: `${decor} ${surface} Cabinet Panel`,
        short: `${surface} cabinet panel with ${a(decor)} HPL face on an MDF core.`,
        description: `Cabinet panel with ${a(decor)} HPL face and ${a(surface.toLowerCase())} surface on an MDF core. Hot pressing with a moisture-resistant adhesive keeps it dimensionally stable and the surface durable.`,
      };
}

/** By position, 1–5. */
export const STEP_EN: Record<number, { title: string; body: string }> = {
  1: { title: 'Paper impregnation', body: 'Kraft paper is soaked in phenolic resin and decor paper in melamine resin, then dried.' },
  2: { title: 'Layering', body: 'Sheets are stacked to the count each thickness needs, with the decor and protective overlay on top.' },
  3: { title: 'High-pressure pressing', body: 'At over 70 bar and around 140 °C the layers fuse into one solid sheet.' },
  4: { title: 'Cutting and calibrating', body: 'Sheets are cut to standard sizes and sanded on the back for even bonding.' },
  5: { title: 'Quality control', body: 'Colour consistency, abrasion resistance and thickness are measured on every batch in our lab.' },
};

/** The starter projects, keyed by their Persian title. */
export const PROJECT_EN: Record<string, { title: string; description: string }> = {
  'آشپزخانهٔ مسکونی با طرح بلوط': {
    title: 'Oak-finish home kitchen',
    description: 'Cabinet carcasses and doors in Natural Oak HPL cabinet panel with an embossed surface.',
  },
  'سرویس بهداشتی مجتمع اداری': {
    title: 'Office building washrooms',
    description: 'Cubicle partitions in 12 mm HPL compact: frameless, and unbothered by daily wet cleaning.',
  },
  'آشپزخانهٔ مدرن تک‌رنگ': {
    title: 'Modern solid-colour kitchen',
    description: 'High-gloss graphite doors on white carcasses — a surface that shrugs off fingerprints and stains.',
  },
  'رختکن و کمدهای باشگاه ورزشی': {
    title: 'Gym changing room and lockers',
    description: 'Lockers and changing-room partitions in HPL compact, in a space with heavy traffic and humidity.',
  },
  'کمد دیواری و اتاق خواب': {
    title: 'Bedroom built-in wardrobe',
    description: 'A floor-to-ceiling wardrobe in white super-matte cabinet panel with concealed handles.',
  },
  'سرویس بهداشتی مدرسه': {
    title: 'School washrooms',
    description: 'Light-coloured compact cubicles with stainless fittings; resistant to knocks and scratches.',
  },
};
