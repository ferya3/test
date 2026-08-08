# تست / Testing

Stage 9. What the suite covers, what it demonstrably catches, and the one class
of gap that has now bitten this project twice.

## 1. The through-line: the test environment is not the production environment

Both of the worst bugs found in this project came from the same place — a
branch the suite *cannot reach*, because `phpunit.xml` configures a different
world from the one `deploy/install-ubuntu.sh` builds.

Stage 8's was a cached `Collection`: perfect under the array cache driver the
tests use, `__PHP_Incomplete_Class` under phpredis with igbinary, 500ing
`/products` in production only. The suite was green throughout.

So the first thing this stage did was enumerate every divergence rather than
wait for the next one.

| Setting | Tests | Production | Covered now |
| --- | --- | --- | --- |
| `DB_CONNECTION` | sqlite `:memory:` | mysql 8 | **CI job** + `MysqlSearchTest` |
| `CACHE_STORE` | array | redis | **CI job** + `CachedPayloadTest` (file store) |
| `CACHE_CATALOG_ENABLED` | `false` | `true` | **CI job** + `CachedPayloadTest` |
| `QUEUE_CONNECTION` | sync | redis | **CI job** + `QueuedConversionsTest` |
| `SESSION_DRIVER` | array | redis | CI job |
| `BCRYPT_ROUNDS` | 4 | 12 | Asserted as config, deliberately not matched |
| `MAIL_MAILER` | array | smtp | Deliberate |

The last two are correct as they stand: hashing at cost 12 in every test would
spend most of the suite's runtime on bcrypt, and a suite that sends real mail
is a suite nobody can run. `SecurityHeadersTest` asserts the *shipped* value of
`BCRYPT_ROUNDS` from `config/hashing.php` and `.env.example` instead, so the
production guarantee is pinned without paying for it on every test.

The rest are now covered twice over: once by a targeted test, and once by a CI
job that runs the entire suite against MySQL and Redis with caching on.

### The search branch nothing had ever run

`ProductQuery::applySearch()` uses `whereFullText()` on MySQL and falls back to
`LIKE` on SQLite. The suite runs on SQLite. So the MySQL branch — and the
migration creating the FULLTEXT index it depends on — had never been executed
by anything, in any environment where a failure would be noticed.

That matters beyond "untested", because the two branches are not equivalent.
`LIKE '%pane%'` matches "panel"; FULLTEXT natural-language mode matches whole
tokens and would not. `whereFullText()` against a column with no FULLTEXT index
is a runtime error on MySQL, not a slow query — so the migration and the query
are one unit, and `MysqlSearchTest` asserts them together, along with the
punctuation a visitor might paste into the search box.

Those tests skip on any non-MySQL driver rather than silently passing, so
running the suite locally reports 7 skipped and tells the truth about it.

## 2. Does the suite actually catch anything?

A green suite proves nothing until you break something on purpose. Six
security- and correctness-critical behaviours were mutated and the full suite
run against each:

| Mutation | Result |
| --- | --- |
| Unpublished product becomes publicly visible | caught (2 failures) |
| Admin gate stops checking `is_active` / role | caught (2 failures) |
| Two-factor gate always passes | caught (2 failures) |
| Gated catalogue download skips the grant check | caught (2 failures) |
| Upload MIME allow-list disabled | caught (5 failures) |
| CSP header never sent | caught (3 failures) |

All six were caught. The same technique was used in stage 8 to prove the
cache-payload tests were load-bearing: reintroducing that bug fails four of
`CachedPayloadTest`'s seven tests.

## 3. Layout

```
tests/
├── Unit/Support/        pure logic — slugs, form ids
└── Feature/
    ├── Admin/           auth, authorisation, CRUD, rendering
    ├── Auth/            two-factor enrolment and challenge
    ├── Backend/         services and observers
    ├── Catalog/         filtering, relationships, cached payloads, MySQL search
    ├── Localization/    locale routing and the locale manager
    ├── Media/           upload pipeline, queued conversions
    ├── Pages/           every public page in both locales, forms, SEO
    └── Security/        headers, CSP, upload hardening
```

327 tests, 838 assertions. 7 skip without MySQL.

Feature tests use `RefreshDatabase`; unit tests stay isolated so they run in
milliseconds. `Model::preventLazyLoading` is on outside production, so a
forgotten eager load fails the suite rather than quietly costing a query per
row on a live page — which is why the stage-8 performance audit found no N+1
anywhere.

## 4. CI

`.github/workflows/ci.yml`, three jobs:

- **Tests (sqlite)** — the fast one. In-memory database, no services to wait
  on, fails within a minute when something is plainly broken.
- **Tests (mysql + redis)** — the whole suite against production-shaped
  services, with `igbinary` installed and catalogue caching switched **on**.
  This job exists specifically because of §1: it is the configuration in which
  the stage-8 bug fails, and the only one in which `MysqlSearchTest` runs.
- **Lint** — `pint --test`.

## 5. Known gaps

- **No browser tests.** Alpine drives the mobile filter drawer, the gallery, the
  comparison tray and the theme toggle; none is exercised by an actual browser.
  Every one is built to work without JavaScript, and the server-rendered result
  *is* tested, so what is untested is the enhancement rather than the function.
  Pest 4 supports browser testing and this is the obvious next step.
- **No coverage percentage.** Neither xdebug nor pcov is installed, so the gap
  analysis here is by reference and by mutation rather than by line count. A
  line-coverage number would be easy to add and would mostly measure how much
  of the codebase is Blade.
- **`SESSION_DRIVER=redis` is only exercised in aggregate** by the CI job, not
  by a test that asserts anything specific about session serialisation.
- **The admin panel's JavaScript-dependent flows** (media library picker,
  bulk actions) are covered at the request level only.

## 6. Running it

```bash
php artisan test                      # everything (7 skip without MySQL)
php artisan test --filter=SeoTest     # one file
composer test                         # clears config first, as CI does
```

To reproduce the production-shaped job locally, with MySQL and Redis running:

```bash
DB_CONNECTION=mysql DB_DATABASE=testing DB_USERNAME=root DB_PASSWORD=root \
CACHE_STORE=redis QUEUE_CONNECTION=redis CACHE_CATALOG_ENABLED=true \
php artisan test
```

Exported environment variables override `phpunit.xml`'s `<env>` entries, which
is what makes that work — verified, because a CI job that silently fell back to
SQLite while claiming to test MySQL would be worse than no job at all.
