# کارایی / Performance

Stage 8. What was measured, what it cost, what changed, and what was
deliberately left alone.

## 1. Method

Measurements are the median of nine warm iterations against a realistic
catalogue — 600 products across 30 categories, 120 colours, 300 decors, 6
materials, 8 surfaces — on the **redis** cache driver, which is what
`deploy/install-ubuntu.sh` configures for production.

Three things had to be controlled for before any number meant anything:

- **Single samples are noise.** The first pass at this showed the products page
  at 123ms, then 357ms, then 227ms across consecutive runs of the same code.
  Everything below is a median of nine.
- **`Model::preventLazyLoading` and `preventAccessingMissingAttributes` are on
  outside production.** They were ruled out by re-running under `APP_ENV=production`;
  the numbers did not move.
- **The cache driver changes the answer.** Local `.env` defaults to `database`
  and the test suite uses `array`. Neither behaves like the production driver,
  which is the subject of finding 1.

## 2. Findings

| # | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| 1 | A cached `Collection` returned `__PHP_Incomplete_Class` under phpredis + igbinary, 500ing the products page in production while passing every test | **Critical** | Cache plain arrays only; regression tests that run the cache on a serialising store |
| 2 | `ui.measure` invoked once per filter option — 874 component renders per products page view | High | Inlined the equivalent markup for the facet count |
| 3 | `filterGroups()` issued 7 uncached queries per products page view | Medium | Moved into `ProductQuery`, cached with the facets it belongs beside |
| 4 | `CatalogCache::version()` re-read the version from the store on every cached lookup | Low | Memoised per request; `CatalogCache` registered as a singleton |

### Finding 1 — the cached Collection

The one that would have taken the site down.

`filterGroups()` was first cached returning `Collection` objects. Under the
`array` driver the cache hands back the identical PHP value, so it worked
locally and passed the full suite. Under phpredis with the **igbinary**
extension loaded — the production configuration — the value came back as
`__PHP_Incomplete_Class`, and iterating it yields raw property strings instead
of option arrays. The filter panel's `fn (array $option)` then died with a
TypeError, and `/products` returned 500.

It was caught only because the benchmark numbers made no sense: the "cached"
page was *slower*, and the render breakdown turned out to be 118 renders of
`laravel-exceptions-renderer::syntax-highlight`. The benchmark had been timing
a stack trace.

Two things follow from that, and both are now enforced:

- **A cached payload contains arrays and scalars, never objects.** `facets()`
  had always returned plain scalars, which is the only reason it never met
  this.
- **The test suite must exercise a serialising store.** `phpunit.xml` sets
  `CACHE_STORE=array` *and* `CACHE_CATALOG_ENABLED=false`, so the cached path
  had no coverage at all. `tests/Feature/Catalog/CachedPayloadTest.php` turns
  the cache on, switches to the `file` store, and asserts both the structural
  rule (no objects at any depth) and the end-to-end behaviour (two consecutive
  requests, the second served from cache). Reintroducing the bug fails four of
  its seven tests.

### Finding 2 — 874 component renders to print integers

`<x-ui.measure>` exists to stop the bidirectional algorithm reordering mixed
latin/Persian runs: "740 kg/m³" displaying as "kg/m³ 740". It earns its cost on
specification values, dimensions and product codes.

It was also being invoked once per filter option, per attribute, to print a
facet count — 874 renders on a single products page view, against 24 rendered
products. A facet count is a bare integer with no unit and nothing to reorder,
so the component's entire purpose is inapplicable. The markup it would emit is
now inlined at that one call site. Every other use of `measure` is untouched,
including the hex codes on the colours page, which genuinely need the LTR
isolation.

## 3. Results

Median of nine, redis, realistic catalogue:

| Page | Before | After | Queries |
| --- | --- | --- | --- |
| home | 12.8ms | 12.8ms | 8 |
| **products index** | **125.6ms** | **46.8ms** | **15 → 8** |
| categories index | 22.2ms | 22.8ms | 4 |
| colours & decor | 123.7ms | 126.7ms | 4 |
| articles index | 21.5ms | 21.3ms | 6 |
| sitemap.xml | — | 2.4ms (cached) | 1 |

The products page is 2.7× faster and issues seven fewer queries.

## 4. What was already right

Worth recording, because an audit that only lists problems implies the rest was
never checked.

- **No N+1 anywhere.** Query counts were measured across a 26× increase in row
  count and did not move. The `Query object owns the eager-load set` rule from
  `ARCHITECTURE.md` §2 holds in practice, and `preventLazyLoading` outside
  production is what keeps it holding.
- **Indexes are used.** `EXPLAIN QUERY PLAN` on the listing and the facet
  aggregates both resolve through `products_is_active_position_index`. No full
  scans. Total SQL time is 0.7–2.8ms per page — the database was never the
  bottleneck on any page measured.
- **Asset budget is healthy.** CSS 15 KB gzipped, JS 23 KB gzipped. Fonts are
  self-hosted, subset, and only the face the active locale needs is preloaded.
- **Image conversions are off-request**, on the queue, as designed.

## 5. Deliberately not done

- **Homepage block caching.** `ARCHITECTURE.md` §10 planned it. The homepage
  measures 12.8ms with 1.3ms of SQL across 8 queries, so a cache would save
  single-digit milliseconds and buy an invalidation surface. Not worth it. The
  plan was written before there was anything to measure.
- **Navigation caching**, also planned. Navigation is a static config array and
  never touches the database. Nothing to cache.
- **`/colors-and-decor` at ~125ms.** It renders 420 swatches — 300 decor
  samples and 120 colours — and that is what the page *is*: a full colour
  chart. The cost is component render volume, not queries (1.0ms SQL). Making
  it faster means rendering less of it, which is a design decision about
  pagination or progressive loading rather than something to change unilaterally
  in a performance pass. Flagged for the design conversation.
- **Brotli.** The nginx template enables gzip only. Brotli would save perhaps
  15–20% over gzip on the CSS and JS, but needs `ngx_brotli` compiled in, which
  the distribution package does not carry. Not worth a source build for ~7 KB.

## 6. Regression guards

- `tests/Feature/Catalog/CachedPayloadTest.php` — cached payloads stay
  serialisation-safe, and the cached read path is exercised end to end on a
  serialising store in both locales.
- `Model::preventLazyLoading` outside production keeps a forgotten eager load
  failing loudly in CI rather than degrading a live page quietly.
