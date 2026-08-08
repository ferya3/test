# سیستم طراحی / Design System

Premium industrial design system for a panel factory. Persian-first (RTL),
English second. Tailwind CSS 4 with CSS-first tokens; no `tailwind.config.js`.

Live reference: **`/design-system`** (registered outside production only).

## 1. Principles

1. **Hairlines over shadows.** Structure comes from 1px borders and whitespace.
   Shadows are reserved for genuinely floating surfaces (dropdowns, modals).
2. **One accent, used sparingly.** Burnt amber marks the single most important
   action in a view. If two things on screen are amber, one of them is wrong.
3. **Small radii.** 2–6px. Pill shapes read as consumer SaaS, not manufacturing.
4. **One gradient.** The scrim over hero photography, and only because text needs
   contrast against an image. Nothing decorative.
5. **Generous vertical rhythm.** Sections breathe via `py-section`
   (`clamp(4rem, 2rem + 8vw, 8rem)`).
6. **Motion is transform and opacity only**, ≤300ms, and globally disabled under
   `prefers-reduced-motion`.
7. **Logical properties only.** `ps/pe`, `ms/me`, `start/end`, `text-start`.
   Never `pl/pr/left/right`. One stylesheet serves both directions.

## 2. Colour

The palette is defined as raw values in `:root`, then mapped to **semantic
tokens**. Components only ever reference semantic tokens, which is why the dark
theme needs no `dark:` variant anywhere in the markup.

### Neutrals — cool graphite (the industrial ground)

`--ink-950` `#0B0D0E` · `900` `#14171A` · `800` `#1E2226` · `700` `#2C3136` ·
`600` `#3D4348` · `500` `#5E656B` · `400` `#7C8489` · `300` `#A8AFB4` ·
`200` `#CDD2D6` · `100` `#E4E7E9` · `50` `#F2F4F5` · `--paper` `#FBFBFA`

Paper is a warm off-white, not `#FFF` — pure white against cool greys reads
clinical.

### Accent — burnt amber

`--amber-800` `#6E3506` · `700` `#8A4308` · `600` `#A04E0A` · `500` `#C2620F` ·
`400` `#DB7C1E` · `300` `#E89B4D` · `100` `#F8DCBC` · `50` `#FDF3E8`

`amber-600` is the interactive surface (white text passes AA at 5.85:1).
`amber-500` is for graphics and large display text only — white on it is 4.16:1,
which fails AA for body copy.

### States

Warning is **ochre and tint-only**. A solid amber warning would be
indistinguishable from the amber brand accent, so there is no
white-on-amber-warning variant; `--warning-surface` is the darker
`--ochre-700`.

### Semantic tokens

| Token | Role |
| --- | --- |
| `surface` / `surface-subtle` / `surface-raised` / `surface-inverse` | backgrounds |
| `text` / `text-secondary` / `text-muted` / `text-placeholder` / `text-inverse` / `text-on-accent` | foregrounds |
| `border` / `border-strong` / `border-inverse` | hairlines and control borders |
| `accent` / `accent-text` / `accent-surface` / `accent-surface-hover` / `accent-tint` / `accent-tint-text` / `accent-tint-border` | the accent, split by use |
| `success-*` / `danger-*` / `warning-*` / `info-*` | states, surface + tint |
| `focus-ring` | the single focus indicator |

### Contrast is verified, not assumed

```bash
npm run check:contrast
```

`tools/check-contrast.mjs` asserts 37 real pairings against WCAG 2.1 AA — 4.5:1
for body text, 3:1 for large text, control borders and focus rings. It exits
non-zero on failure. **Re-run it after editing any colour.** Three defects were
found and fixed this way during Stage 2:

- white on `amber-500` was 4.16:1 → the interactive token moved to `amber-600`
- white on the original warning amber was 3.64:1 → warning became tint-only ochre
- the dark-mode control border was 2.91:1 → `ink-500` lightened to `#5E656B`,
  which clears 3:1 on both dark surfaces while still passing 4.5:1 as muted text
  on paper

## 3. Theming

Three states, matching how CSS declares them:

| Preference | Root attribute | Resolved by |
| --- | --- | --- |
| System (default) | *none* | `prefers-color-scheme` |
| Light | `data-theme="light"` | explicit |
| Dark | `data-theme="dark"` | explicit |

Every token has its light value on bare `:root`. Dark values are declared twice —
under `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme='light'])`, and under `:root[data-theme='dark']` — so a
toggle wins in **both** directions. No colour is ever defined only inside a media
query.

`@theme inline` is what makes this work: utilities reference the custom property
instead of inlining its computed value, so reassigning a token restyles the whole
page.

The attribute is applied by an inline script in `<head>` before first paint, so a
stored dark preference never flashes a light page.

## 4. Typography

| Locale | Face | Subsets shipped | Base leading |
| --- | --- | --- | --- |
| `fa` | Vazirmatn Variable | arabic (46 KB) + latin (34 KB) | 1.85 |
| `en` | Inter Variable | latin (48 KB) | 1.75 |

Self-hosted from `public/fonts` — no third-party origin in the CSP, no extra DNS
lookup ahead of the LCP. Filenames are **stable, not content-hashed**, so the
layout can `<link rel="preload">` the active locale's face without reading the
Vite manifest. Refresh them with `npm run fonts` after bumping either package.

`unicode-range` plus the `html[lang]` font switch means a Persian page never
downloads Inter and an English page never downloads the Arabic subset. Only the
active locale's face is preloaded.

Persian gets more leading (1.85 vs 1.75 body, 1.35 vs the Latin scale on
headings) because Persian glyphs carry ascenders and descenders that need the
room.

### Scale

Display sizes are fluid (`clamp`) so a headline never wraps awkwardly between
breakpoints: `text-display`, `text-h1`…`text-h4`, `text-lead`, `text-body-lg`,
`text-body`, `text-body-sm`, `text-caption`, `text-overline`.

### Bidirectional text — the one thing that will bite you

A latin run inside Persian text is **reordered** by the bidi algorithm:

| Written | Renders as (unisolated) |
| --- | --- |
| `740 kg/m³` | `kg/m³ 740` |
| `2800 × 1220 mm` | `mm 1220 × 2800` |
| `+98 21 1234 5678` | `5678 1234 21 98+` |

This site is full of such values — specification tables, sheet sizes, product
codes, phone numbers. **Never interpolate them directly.** Use:

```blade
<x-ui.measure :value="740" unit="kg/m³" />
<x-ui.measure value="+98 21 1234 5678" dir="ltr" />
```

`dir="auto"` (the default) resolves direction from the content, which is what
mixed values like `تا 180` need — forcing LTR there would move the Persian word
to the wrong side. `dir="ltr"` is for content that is latin in every locale.

The unit is isolated separately, because a unit beginning with a neutral
character (`°C`) is otherwise reordered into `C°` even when the value around it
sits correctly.

Utilities: `.bidi-isolate` (isolate, direction from content), `.ltr-isolate`,
`.rtl-isolate`.

## 5. Spacing, radii, elevation

- **Space**: Tailwind's 4px scale, plus `--spacing-section`,
  `--spacing-section-sm`, `--spacing-gutter` for page rhythm.
- **Measures**: `--container-page` (82.5rem) and `--container-content` (46rem).
- **Radii**: `xs` 2px, `sm` 3px, `md` 4px, `lg` 6px, `xl` 10px.
- **Shadows**: `hairline`, `sm`, `md`, `lg` — used sparingly.
- **Easing**: `--ease-industrial` `cubic-bezier(.2,.8,.2,1)`.

## 6. Components

```
resources/views/
├── components/
│   ├── layouts/app.blade.php        page shell (must live under components/
│   │                                for <x-layouts.app> to resolve)
│   ├── layout/
│   │   ├── container                page vs content measure
│   │   ├── section                  tone + vertical rhythm
│   │   ├── section-header           overline / heading / lead
│   │   ├── language-switcher        plain links, works without JS
│   │   └── theme-toggle             light / dark / system
│   ├── ui/
│   │   ├── button                   6 variants, 3 sizes, loading, disabled
│   │   ├── badge                    7 tones
│   │   ├── card                     optional stretched-overlay link
│   │   ├── field                    label / hint / error chrome
│   │   ├── input textarea select checkbox
│   │   ├── alert                    4 tones, dismissible
│   │   ├── breadcrumbs              mirrored chevrons
│   │   ├── measure                  bidi-safe values
│   │   └── spinner
│   └── media/picture                the only way to render an image
└── partials/header.blade.php, footer.blade.php
```

### Accessible form wiring

A Blade slot evaluates in the **caller's** scope, so a field component cannot
hand a computed `aria-describedby` to a control rendered in its slot. Both sides
derive the ids from `App\Support\FormIds` instead, which keeps
`aria-describedby` pointing at elements that exist.

`x-ui.input`, `x-ui.textarea` and `x-ui.select` are self-contained and wire this
for you: hint when valid, `aria-describedby` + `aria-invalid` when not, with the
error carrying `role="alert"`. Use `x-ui.field` directly only for a bespoke
control.

### `x-media.picture` — the only image entry point

Always emits AVIF → WebP → original, `srcset`, intrinsic `width`/`height` (or an
aspect-ratio frame), `loading`, `decoding` and `fetchpriority`. Pass `priority`
for the one above-the-fold LCP image per page; everything else stays lazy. With
no media attached it renders a neutral placeholder that **still reserves layout
space**, so a missing image cannot shift the page.

`sizes` defaults to `100vw` and should almost always be overridden — getting it
wrong is the most common cause of a browser downloading an oversized image.

## 7. Accessibility rules

- One focus indicator: 2px `--focus-ring`, 2px offset, via `:focus-visible`.
  Never removed.
- Skip link is the first tab stop.
- Interactive cards use a stretched overlay anchor, so a card is **one** tab stop
  with an accessible name taken from its heading (`labelledby`).
- Navigation disclosures are explicit buttons with `aria-expanded`, not hover —
  keyboard and touch users need a real toggle.
- The mobile drawer traps focus (`x-trap.noscroll`) and closes on Escape.
- Decorative marks (`*` on required fields, eyebrow rules, icons) are
  `aria-hidden`; the real semantics come from `required` and element roles.
- The theme toggle renders only when JavaScript runs — without JS the page
  already follows the OS preference, and a dead control is worse than none.

## 8. Verified in Stage 2

Rendered with Chromium in both locales and themes; computed values read back
from the DOM rather than eyeballed:

| Page | `dir` | Resolved font | Body background | Leading |
| --- | --- | --- | --- | --- |
| `/design-system` | `rtl` | Vazirmatn | `rgb(251,251,250)` | 29.6px |
| `/en/design-system` | `ltr` | Inter | `rgb(251,251,250)` | 28px |
| `/design-system` (dark) | `rtl` | Vazirmatn | `rgb(11,13,14)` | 29.6px |

Zero console errors. Contrast: 37/37 pairings pass. Built bundle: 70 KB CSS
(14.9 KB gzip), 73 KB JS (24.8 KB gzip).
