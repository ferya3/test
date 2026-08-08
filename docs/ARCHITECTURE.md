# معماری / Architecture

Premium industrial corporate website for a factory manufacturing kitchen cabinet
panels and decorative panels. Persian-first (RTL), English as second language.

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Laravel 13 (PHP 8.4) |
| Templating | Blade + reusable components |
| CSS | Tailwind CSS 4 (CSS-first `@theme` tokens) |
| JS | Alpine.js 3 (progressive enhancement only) |
| Bundler | Vite 8 |
| Database | MySQL 8 (SQLite in-memory for tests) |
| Cache / Queue | Redis (`phpredis`) |
| Web server | Nginx + PHP-FPM |
| Containers | Docker Compose |
| Images | Intervention Image v4 (GD driver) → WebP/AVIF |
| RBAC | spatie/laravel-permission |
| Tests | Pest 4 (see `docs/TESTING.md`) |

## 2. Layered architecture

```
HTTP request
   │
   ├─ Middleware  (SetLocale, SecurityHeaders, ContentSecurityPolicy, throttle)
   │
   ├─ Controller  (thin: resolve input → call service/query → return view)
   │     ├─ Form Request      (validation + authorize())
   │     └─ Policy / Gate     (authorization)
   │
   ├─ Service     (App\Services\*  — business logic, transactions, side effects)
   │     └─ Action/Data objects (App\Support\Data\*  — typed DTOs)
   │
   ├─ Query object (App\Queries\*  — read models, filtering, eager loading)
   │
   └─ Eloquent model (App\Models\*  — relationships, casts, scopes only)
```

Rules enforced throughout:

- **Thin controllers.** A controller method resolves a Form Request, delegates to
  a service or query object, and returns a view or redirect. No query building,
  no branching on business rules.
- **No business logic in Blade.** Views receive view models / already-shaped
  collections. Blade contains presentation and `@if` on presentation state only.
- **Services are injected**, never statically resolved, so they are mockable.
- **Read paths use Query objects** (`ProductQuery`, `ArticleQuery`) which own
  filtering, sorting and — critically — the eager-load set, so N+1 cannot creep
  in from a controller.
- **Writes go through services** wrapped in DB transactions where more than one
  table is touched (e.g. `ProductService::update()` syncs pivots + SEO + media).

### Directory map

```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Public/          Home, Product, Category, Article, Project, …
│   │   └── Admin/           resource controllers, one per entity
│   ├── Requests/            Form Requests (Public/*, Admin/*)
│   ├── Middleware/          SetLocale, SecurityHeaders, EnsureTwoFactor, …
│   ├── ViewModels/          page-level view models
│   └── Resources/           API/JSON resources (search, compare)
├── Models/                  Eloquent models only
├── Policies/                one policy per manageable entity
├── Services/
│   ├── Media/               MediaService, ImageOptimizer, conversions
│   ├── Seo/                 SeoManager, SchemaGenerator, SitemapBuilder
│   ├── Catalog/             ProductService, CategoryService, FilterRegistry
│   └── Inquiry/             ContactService, CatalogRequestService
├── Queries/                 ProductQuery, ArticleQuery, ProjectQuery
├── Support/                 Data objects, enums, helpers
│   ├── Enums/
│   └── Data/
└── Jobs/                    ProcessMediaConversions, WarmCaches, notifications
```

## 3. Localisation strategy

Persian is the default locale and lives at the **root** of the site; English is
served under an `/en` prefix.

```
/                      → fa  (default, RTL)
/products/{slug}       → fa
/en                    → en  (LTR)
/en/products/{slug}    → en
```

- Route bodies are registered once and mounted twice by
  `RouteServiceProvider`/`routes/web.php`, so there is a single source of truth.
- `SetLocale` middleware sets `app()->setLocale()` and shares `dir` (`rtl`/`ltr`)
  with views.
- Translatable content is stored in **JSON columns** (`{"fa": "...", "en": "..."}`)
  read through the `HasTranslations` trait, with fallback to the default locale.
  This keeps one row per entity — no join explosion, no duplicated relations.
- URLs use a **single latin slug** shared by both locales. SEO-friendly, stable,
  and avoids duplicate-content splits.
- `hreflang` alternates + `x-default` are emitted on every page.

Because JSON columns are not usefully indexable for search, products carry a
denormalised `search_index` TEXT column (all searchable text, both locales)
maintained on save. MySQL gets a `FULLTEXT` index on it; SQLite (tests) falls
back to `LIKE`, selected at runtime by driver.

## 4. Database schema

### 4.1 Identity & access

**users** — `name`, `email` (unique), `password`, `is_active`,
`two_factor_secret` (encrypted), `two_factor_recovery_codes` (encrypted),
`two_factor_confirmed_at`, `last_login_at`, `last_login_ip`.

**roles / permissions / model_has_roles / role_has_permissions** — spatie.

Roles: `super-admin`, `admin`, `editor`, `product-manager`.

### 4.2 Media

**media** — single table for every uploaded asset.

| column | notes |
| --- | --- |
| `disk`, `path` | `path` unique |
| `filename`, `mime_type`, `extension`, `size` | validated on upload |
| `width`, `height` | stored so `<img>` always gets dimensions (CLS) |
| `alt`, `title`, `caption` | translatable JSON |
| `collection` | `products`, `projects`, `articles`, … (indexed) |
| `conversions` | JSON map of generated WebP/AVIF variants + widths |
| `checksum` | sha256, indexed — de-duplicates re-uploads |
| `uploaded_by` | FK → users, nullSet on delete |

### 4.3 Catalogue

Attribute tables, all with `slug` (unique), translatable `name`, `position`,
`is_active`:

- **colors** — `hex`, `color_family`, swatch `media_id`
- **decors** — `code`, `decor_family`, sample `media_id`
- **materials** — MDF / HDF / particleboard / plywood
- **surfaces** — matte / high-gloss / super-matte / embossed, `gloss_level`
- **applications** — kitchen cabinet / wardrobe / wall panel / commercial
- **thicknesses** — `value_mm` decimal(5,2) unique

**categories** — self-referencing tree (`parent_id`), translatable `name` /
`short_description` / `description`, `cover_media_id`, `position`, `is_active`.

**products** — one row per panel SKU.

- Identity: `slug` (unique), `code` (unique)
- Single-valued attributes as FKs: `category_id`, `material_id`, `surface_id`,
  `decor_id`, `color_id` — each panel SKU *is* a specific decor/colour, which is
  how panel catalogues actually work, and it keeps filtering to simple joins.
- Multi-valued attributes as pivots: `product_thickness`, `application_product`
  (a given panel is genuinely produced in several thicknesses and serves
  several applications).
- Content: translatable `name`, `short_description`, `description`
- Assets: `main_media_id`, `datasheet_media_id` (PDF), gallery via `product_media`
- Flags: `is_active`, `is_featured`, `position`, `published_at`
- `search_index` (FULLTEXT on MySQL), `view_count`, soft deletes

Related tables:

- **product_dimensions** — `width_mm`, `height_mm`, `label` (sheet sizes)
- **product_specifications** — grouped translatable `label`/`value` + `unit`,
  ordered (technical specifications)
- **product_media** — gallery pivot with `position`
- **product_related** — self-referencing pivot with `position`

Composite indexes chosen for the actual query shapes:
`(is_active, published_at)`, `(category_id, is_active)`,
`(is_featured, is_active)`.

### 4.4 Editorial

- **pages** + **page_sections** — the editorial pages (About Factory, Factory &
  Production, Production Process, Quality Control) are CMS-driven. `page_sections`
  is a normalised, ordered, typed block list (`type`, `heading`, `body`,
  `media_id`, `data` JSON) reused by every template — process steps and QC
  stages are just section types.
- **article_categories**, **articles** — `status` (draft/published/archived),
  `published_at`, `cover_media_id`, `author_id`, `reading_time`, soft deletes.
- **projects** + **project_media** + **product_project** — projects link back to
  the products used, which feeds internal linking and `relatedTo` schema.
- **certificates** — `issuer`, `certificate_number`, `issued_at`, `expires_at`,
  image `media_id` + `document_media_id` (PDF).
- **catalogs** — `version`, cover + `file_media_id` (PDF),
  `requires_registration`, `download_count`.

### 4.5 Leads

- **contact_requests** — one table, discriminated by `type` enum:
  `contact` | `quote` | `sample` | `representation`. This covers تماس با کارخانه,
  استعلام قیمت, درخواست نمونه and درخواست نمایندگی without four near-identical
  tables. Carries optional `product_id`, `status`, `ip_address`, `user_agent`,
  `handled_by`, `handled_at`.
- **catalog_requests** — kept separate (per spec) because it is tied to a
  specific `catalog_id` and drives the gated download flow.
- **representatives** — `province` / `city` (both indexed for the locator),
  contact details, `latitude` / `longitude`.

### 4.6 Cross-cutting

- **seo_metadata** — polymorphic (`seoable_type`, `seoable_id`, unique together).
  `title`, `description`, `keywords`, `canonical_url`, `og_*`, `og_media_id`,
  `twitter_card`, `robots`, `structured_data` override.
- **settings** — `key` (unique), JSON `value`, `group`, `is_public`. Cached as a
  single blob; invalidated on write.

## 5. Page structure

| # | Page | Route | Source |
| --- | --- | --- | --- |
| 1 | Home | `/` | curated: featured products, categories, projects, articles |
| 2 | About Factory | `/about` | `pages` + `page_sections` |
| 3 | Factory & Production | `/factory` | `pages` + `page_sections` |
| 4 | Production Process | `/production-process` | `pages`, step sections |
| 5 | Products | `/products` | `ProductQuery` + filters |
| 6 | Product Categories | `/categories`, `/categories/{slug}` | `categories` |
| 7 | Product Details | `/products/{slug}` | `products` |
| 8 | Colors & Decor | `/colors-and-decor` | `colors` + `decors` |
| 9 | Projects | `/projects`, `/projects/{slug}` | `projects` |
| 10 | Quality Control | `/quality-control` | `pages`, QC sections |
| 11 | Certificates | `/certificates` | `certificates` |
| 12 | Catalog | `/catalog` | `catalogs` + gated download |
| 13 | Articles | `/articles`, `/articles/{slug}` | `articles` |
| 14 | Contact | `/contact` | form → `contact_requests` |
| 15 | Representatives | `/representatives` | `representatives` + locator |

Utility routes: `/search`, `/compare`, `/sitemap.xml`, `/robots.txt`.

## 6. Component structure

```
resources/views/
├── layouts/            app, admin
├── components/
│   ├── ui/             button, badge, card, input, select, textarea,
│   │                   checkbox, field, alert, modal, tabs, accordion,
│   │                   breadcrumbs, pagination, spinner
│   ├── layout/         header, nav, mega-menu, footer, sticky-cta,
│   │                   language-switcher, section, container
│   ├── media/          picture (responsive AVIF/WebP srcset), gallery,
│   │                   lightbox, video
│   ├── product/        card, grid, filters, filter-group, specs-table,
│   │                   swatch, compare-bar, related
│   ├── content/        hero, stat, feature, step, quote, cta-band, prose
│   └── seo/            meta, schema, hreflang
└── pages/              one folder per page
```

`<x-media.picture>` is the single image entry point: it always emits `width`,
`height`, `loading`, `decoding`, `sizes` and an AVIF→WebP→original `<picture>`
chain, which is what keeps CLS and LCP in budget.

## 7. Design system

See `docs/DESIGN-SYSTEM.md` (Stage 2) for tokens. Summary:

- **Palette** — graphite/steel neutrals as the ground, a single warm amber accent
  for CTAs (industrial, not SaaS). No decorative gradients; one subtle
  scrim gradient over hero photography for text contrast.
- **Type** — Vazirmatn (Persian, variable) as the primary face; Inter for Latin
  numerals/English. Large editorial display sizes, tight tracking on headings.
- **Space** — 4px base scale, generous section rhythm (`py-20` → `py-32`).
- **Motion** — transform/opacity only, ≤300ms, all wrapped in
  `prefers-reduced-motion` guards.

## 8. Admin panel

Mounted at `/admin` from `routes/admin.php`, outside the public locale routing:
the back office is single-language (Persian) and never carries an `/en` prefix.

### 8.1 Three concentric gates

| layer | middleware | what it stops |
| --- | --- | --- |
| guest | `guest` | the sign-in form itself |
| access | `auth` + `EnsureCanAccessAdmin` | signed-out, deactivated, or non-admin accounts |
| second factor | `RequireTwoFactor` | privileged roles that have not cleared TOTP |

`EnsureCanAccessAdmin` answers **404, not 403**, to an authenticated user with no
admin role — an ordinary customer account learns nothing about what lives behind
the prefix. It also re-checks `is_active` on every request, so revoking an
account takes effect immediately rather than whenever its session expires.

Enrolment and the challenge are registered *outside* the two-factor gate; inside
it, there would be no way through it. The confirmation is session-scoped with an
8-hour TTL, so a long-lived "remember me" cookie cannot stand in for the second
factor indefinitely.

### 8.2 Field-driven CRUD

Twenty hand-written index/form view pairs drift apart within a month, and a
field added to a form but forgotten in the validation rules is precisely how
mass-assignment bugs arrive. So each resource declares its fields **once**:

```php
Field::translated('title', __('admin.field.title'), required: true)->listed(),
Field::enum('status', __('admin.field.status'), ArticleStatus::class, required: true)->listed(),
Field::relation('applications', __('admin.field.applications'), $options, 'applications'),
```

`CrudController` derives the list table, the edit form, the validation rules and
the relation sync from that one declaration. Relations are synced explicitly
after validation rather than mass assigned. `Field::enum()` takes options *and*
validation from the enum itself, so a case cannot be offered without being
accepted — nor accepted without being offered.

Authorisation is never hand-rolled per action: every resource has a policy
extending `ResourcePolicy`, which maps the action onto the permission matrix in
`App\Support\Permissions`. Navigation is filtered through the same policies — a
link that leads straight to a 403 is worse than no link.

### 8.3 Deliberately not editable

- **`page_sections`** — the ordered blocks composing About/Factory/Process/
  Quality are seeded *structure*, not free-form content. Pages themselves are
  editable; their section skeleton is a migration concern.
- **Page creation and deletion** — each page backs a fixed route, so deleting
  one would turn a linked page into a 404.
- **Roles and permissions** — the matrix is code, reviewed in version control.
  Role *assignment* is available in the user screen; inventing new roles at
  runtime is not.
- An **Admin cannot administer users.** An Admin who could grant roles could
  grant themselves Super Admin, which would make the distinction meaningless.

## 9. SEO

`App\Services\Seo\SeoManager` resolves one `SeoData` view model per page —
title, description, canonical, robots, Open Graph, Twitter Card — and hands it
straight to `<x-layouts.app :seo="…">`. A controller never assembles its own
`<head>` by hand, so none can ship a page missing a canonical tag.

- **Precedence.** An entity's `seo_metadata` row (via `HasSeoMetadata`) wins
  field-by-field over the caller's derived default (a product's own name and
  description), which wins over the site-wide `seo_default_*` settings. A
  hand-authored title is used exactly as written; a derived one gets the
  `— Site Name` suffix a raw heading needs.
- **Structured data.** `App\Services\Seo\SchemaGenerator` builds Organization
  and WebSite nodes on every page, plus a `Product`/`Article` node on detail
  pages, combined by `graph()` into one `@graph` document. `seo_metadata.structured_data`
  — hand-authored in the admin — replaces the generated graph outright rather
  than merging into it. Breadcrumb schema is emitted separately, alongside the
  visual breadcrumbs each page already builds, via `<x-seo.schema :data="…">`.
  JSON-LD is written with `Js::encode()` (HEX-escaped, not `Js::from()`'s
  `JSON.parse('…')` wrapper) — `application/ld+json` is parsed as raw JSON, not
  executed, so a JS expression there is unparsable by crawlers.
- **hreflang.** `<x-seo.hreflang>` reads `LocaleManager::alternates()` off the
  current request path, independent of any page-specific data — every page
  gets fa/en + `x-default` alternates for free, with no controller wiring.
- **Canonical over query strings.** Canonical URLs are built from the route
  name and path parameters alone, never the query string — a filtered
  `/products?surface=high-gloss` and a `?province=`-scoped representative
  list canonicalise to their bare listing page rather than fragmenting into
  separate indexed variants. `/search` and `/compare` go further and carry
  `noindex,follow`: the same URL shape renders different content on every
  query, which is exactly what should not be indexed.
- **Sitemap.** `App\Services\Seo\SitemapBuilder` (spatie/laravel-sitemap)
  walks products, categories, articles, projects and the four editorial
  pages, emitting one `<url>` per locale an entity actually has content in —
  `HasTranslations::translatedLocales()` decides that per row, so a
  Persian-only product does not get an English sitemap entry that silently
  falls back to Persian. Cached by `SitemapCache` on the same version-bump
  scheme as `CatalogCache`, invalidated by `InvalidatesSitemapCache` on the
  models that contribute a URL.
- **robots.txt** is generated (`RobotsController`), not a static file, so its
  `Sitemap:` line carries the deploying environment's real `APP_URL`; `deploy/install-ubuntu.sh`'s
  `location = /robots.txt { try_files $uri /index.php?$query_string; }` only
  falls through to the route when no static file shadows it.

## 10. Performance

- AVIF + WebP + fallback, responsive `srcset`, explicit dimensions, `fetchpriority`
  on the LCP image, `loading="lazy"` everywhere below the fold.
- Self-hosted, subset, preloaded variable fonts with `font-display: swap`.
- Redis for cache + queue. Version-keyed caches (`CatalogCache`) for filter
  facets and filter options, plus the settings blob and the sitemap,
  invalidated by model observers.
- Image conversions generated **off-request** via queued jobs.
- Query objects own eager loading; a `PreventLazyLoading` guard is enabled in
  non-production so N+1 fails loudly in CI.
- Nginx: gzip, immutable far-future caching for hashed Vite assets.

**A cached payload contains arrays and scalars, never objects.** A cached
`Collection` survives the array driver the tests use and returns
`__PHP_Incomplete_Class` under phpredis with igbinary — the production
configuration — taking the page down with a TypeError. `CachedPayloadTest`
enforces this on a serialising store.

**Stage 8 measurements, findings and the things deliberately left alone are in
`docs/PERFORMANCE.md`.** Two items planned above were dropped on evidence:
homepage-block caching (the homepage spends 1.3ms in SQL, so there is nothing
to win) and navigation caching (navigation is static config and never queries).

## 11. Security

CSRF, hashed passwords (bcrypt cost 12, pinned in `config/hashing.php`), Form
Request validation on every write, policies on every admin resource, rate
limiting on all public forms and login, TOTP 2FA required for admin roles,
`SameSite=Lax` / httpOnly / TLS-only cookies, encrypted sessions, upload
validation by real MIME + extension allow-list + size caps with executable
uploads rejected outright, and gated documents stored on a private disk and
streamed through a controller.

Response headers are set by `SecurityHeaders` and `ContentSecurityPolicy`
(configured in `config/security.php`) rather than left to the web server, so
they do not depend on one deployment's nginx file being the thing serving the
app. The CSP carries the per-request nonce `Vite::useCspNonce()` generates,
which every script tag the application emits also carries.

**Stage 7 audit findings and their resolution — including the image
decompression bomb that the byte-size cap could not see, and the reasoning
behind the two directives in the CSP that are looser than the rest — are in
`docs/SECURITY.md`.** That document also carries the residual risks and the
pre-launch operator checklist.
