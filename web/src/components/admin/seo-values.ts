export type SeoValues = { seo_title?: string; seo_description?: string; seo_title_en?: string; seo_description_en?: string };

/**
 * The four search fields of a product or group row, as a plain object: rows
 * from node:sqlite have a null prototype, which a client component cannot take.
 */
export const seoValues = (row?: SeoValues): SeoValues => ({
  seo_title: row?.seo_title ?? '',
  seo_description: row?.seo_description ?? '',
  seo_title_en: row?.seo_title_en ?? '',
  seo_description_en: row?.seo_description_en ?? '',
});
