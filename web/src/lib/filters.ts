import { isFamily, isSurface, isThickness } from './catalog.ts';
import type { Filters } from './queries.ts';

type Params = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Filters from the query string, keeping only values the catalogue knows.
 *
 * Anything else is dropped rather than rejected: a stale bookmark or a
 * hand-edited URL should show the products it still can, not an error page.
 * Only whitelisted values ever reach a query.
 */
export function parseFilters(params: Params): Filters {
  const unique = <T extends string>(values: T[]) => [...new Set(values)].slice(0, 10);

  return {
    families: unique(list(params.family).filter(isFamily)),
    surfaces: unique(list(params.surface).filter(isSurface)),
    thicknesses: unique(list(params.thickness).filter(isThickness)),
  };
}

export const activeCount = (f: Filters) => f.families.length + f.surfaces.length + f.thicknesses.length;
