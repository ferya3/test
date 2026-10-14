# Artavil Gold — website

The Artavil Gold site (آرتاویل گلد): HPL cabinet panels and HPL compact sheet.
Persian, right to left, built for phones first.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15.5 (App Router), React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4 (tokens in `src/app/globals.css`), shadcn-style components (`cva`, `clsx`, `tailwind-merge`, Radix Slot) |
| Icons, font | lucide-react, Vazirmatn (self-hosted via `@fontsource-variable/vazirmatn`) |
| Motion | Framer Motion (reveals, counters, tilt cards, menu), GSAP + ScrollTrigger (pinned horizontal section), Lenis (smooth scroll) |
| 3D | three.js + React Three Fiber + Drei (hero panels, textures drawn procedurally — nothing fetched) |
| State | Zustand (mobile menu) |
| Data | SQLite through Node's built-in `node:sqlite` — no database server |
| Uploads | sharp: every image is decoded and re-encoded to WebP |
| Auth | scrypt passwords, hashed session tokens, TOTP two-step login — all on `node:crypto` |
| Forms | Server Actions |

Node.js **22.13 or newer** is required (`node:sqlite` without a flag).

## Development

```bash
npm install
npm run db:seed        # creates data/app.db, prints the admin password once
npm run dev            # http://localhost:3000, admin at /admin
npm run typecheck
npm run build
```

`scripts/check-contrast.mjs` verifies every colour pairing in the palette
against WCAG AA; run it after changing a colour.

## Where things are

- `src/app/(site)` — public pages: home, category (filters in the URL), product, about, contact
- `src/app/admin` — login, two-step verification, and the panel (products, groups, site text, messages, security)
- `src/lib/db.ts` — connection and schema migrations (`PRAGMA user_version`)
- `src/lib/queries.ts` — catalogue reads, faceted filter counts, site settings and their defaults
- `src/lib/session.ts`, `crypto.ts`, `totp.ts` — authentication
- `src/lib/images.ts` — upload validation and WebP conversion; files are served by `src/app/media/[name]/route.ts`
- `deploy/` — server install and update scripts

## Security notes

- Every SQL statement uses bound parameters; filter values are whitelisted before they reach a query.
- Admin pages are guarded in a Node-runtime layout and every Server Action checks the session again.
- Session cookies are httpOnly, SameSite=Strict, and Secure whenever `SITE_URL` is https.
- Login is rate-limited per address+account and per address; 2FA codes are single-use.
- Uploads are accepted only if sharp decodes them as JPEG/PNG/WebP/AVIF; what is stored is a fresh WebP. SVG and anything executable are refused.
- CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy on every response (`next.config.ts`).
- `.env*` files and `data/` are git-ignored.

## Server

On Ubuntu 22.04/24.04/26.04, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/industrial-panel-website-z61mth/web/deploy/install.sh | bash
```

Set `SITE_URL=https://your-domain` (and `DOMAIN=your-domain`) before the command when
there is a domain; otherwise the server's IP is used. Updates:
`bash /opt/artavil-web/web/deploy/update.sh`. Data (database and uploads) lives in
`/var/lib/artavil-web` — that directory is what to back up.
