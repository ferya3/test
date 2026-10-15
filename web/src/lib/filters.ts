import type { Filters } from './queries.ts';
import type { AttributeCatalog } from './attributes.ts';

type Params = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Filters from the query string, keeping only values the catalogue knows.
 *
 * Anything else is dropped rather than rejected: a stale bookmark or a
 * hand-edited URL should show the products it still can, not an error page.
 * Only values that exist in the attributes table ever reach a query.
 */
export function parseFilters(params: Params, catalog: AttributeCatalog): Filters {
  const keep = (values: string[], known: Set<string>) => [...new Set(values.filter((v) => known.has(v)))].slice(0, 20);

  // A switched-off attribute has no filter on the page, so none in the URL either.
  const { show } = catalog;
  return {
    families: show.family ? keep(list(params.family), catalog.values.families) : [],
    surfaces: show.surface ? keep(list(params.surface), catalog.values.surfaces) : [],
    thicknesses: show.thickness ? keep(list(params.thickness), catalog.values.thicknesses) : [],
  };
}

export const activeCount = (f: Filters) => f.families.length + f.surfaces.length + f.thicknesses.length;
