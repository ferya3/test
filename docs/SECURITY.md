# امنیت / Security

Stage 7. What this application defends against, how, and — where a defence is
deliberately partial — what the residual risk is and why it was accepted.

## 1. Audit findings

The stage began as an audit of what stages 1–6 had actually built, rather than
as a list of controls to bolt on. Five things came out of it.

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| 1 | Image decompression bomb: the upload cap measured compressed bytes, so a 65-byte PNG declaring 30000×30000 passed it and would ask GD for ~3.4 GB | High (DoS) | Pixel budget enforced from the file header before any decode — `ImageOptimizer::assertWithinPixelBudget()` |
| 2 | `Vite::useCspNonce()` generated a nonce on every request that nothing consumed — there was no CSP | Medium | `ContentSecurityPolicy` middleware |
| 3 | Security headers existed only in the nginx site file, so they vanished under `artisan serve` or any other front end | Medium | `SecurityHeaders` middleware; nginx now sets them only for the static responses the app never sees |
| 4 | bcrypt cost was a framework default, while the docs stated it as a project guarantee | Low | Pinned in `config/hashing.php` |
| 5 | No trusted-proxy configuration: correct today, silently wrong the moment a CDN is added, collapsing every IP-keyed rate limit into one shared bucket | Low (latent) | `TRUSTED_PROXIES` knob in `bootstrap/app.php` |

Finding 1 is the one worth dwelling on. `max_size.image` is 8 MB and it was
doing exactly what it says — capping the size of the *file*. The cost of an
image, though, is its pixel count, and the two are unrelated: compression is
precisely the art of making them diverge. A crafted PNG is a few dozen bytes
and 900 megapixels. Because conversions run on a queue, the blast radius was
not one HTTP request but the worker — and the worker retries.

`getimagesizefromstring()` reads the IHDR and nothing else, so the dimensions
are known without allocating the bitmap. The check lives in
`ImageOptimizer::decode()` rather than at the upload boundary because every
decode in the class funnels through that one method, including the ones the
queued job makes long after the request has ended.

## 2. Authentication and access

Three concentric gates, described in `docs/ARCHITECTURE.md` §8.1:

| Layer | Middleware | Stops |
| --- | --- | --- |
| guest | `guest` | the sign-in form itself |
| access | `auth` + `EnsureCanAccessAdmin` | signed-out, deactivated, non-admin |
| second factor | `RequireTwoFactor` | privileged roles that have not cleared TOTP |

- `EnsureCanAccessAdmin` answers **404, not 403**. A 403 confirms that
  something exists to be forbidden from; an ordinary customer account probing
  `/admin` learns nothing.
- It re-reads `is_active` on every request, so deactivating an account takes
  effect on that account's next request rather than whenever its session
  happens to expire.
- The session id is regenerated on sign-in *and* again on passing the second
  factor, so a fixed session cannot survive either step.
- Passwords: bcrypt, cost 12 (`config/hashing.php`), `verify => true` so a hash
  from another algorithm cannot be accepted by the bcrypt verifier.
- TOTP secrets and recovery codes are encrypted at rest by the model's casts
  and excluded from serialisation. Recovery codes are compared with
  `hash_equals()` and consumed on use.
- Rate limits: 10/min per IP on the login route, 5 attempts per user+IP on the
  TOTP challenge. Six digits is a small space; an unthrottled challenge is
  brute-forceable in minutes.

## 3. Authorisation

Every admin resource has a policy extending `ResourcePolicy`, which maps the
action onto the permission matrix in `App\Support\Permissions`. Navigation is
filtered through the same policies — a link that leads straight to a 403 is
worse than no link.

`CrudController` mass-assigns **only** the non-relation fields a resource has
declared, and syncs relations explicitly afterwards. A crafted payload cannot
write through a relationship, and a field added to a form but forgotten in the
rules cannot exist, because the form and the rules are generated from the same
declaration.

An Admin cannot administer users: an Admin who could grant roles could grant
themselves Super Admin.

## 4. Transport and headers

Set by `SecurityHeaders` and `ContentSecurityPolicy` from `config/security.php`,
on every response rather than in one deployment's web server config.

| Header | Value | Against |
| --- | --- | --- |
| `Content-Security-Policy` | see below | XSS, injected script, clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME confusion on uploaded files |
| `X-Frame-Options` | `SAMEORIGIN` | clickjacking (legacy backstop to `frame-ancestors`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | referrer leakage |
| `Cross-Origin-Opener-Policy` | `same-origin` | cross-origin window handles |
| `X-Permitted-Cross-Domain-Policies` | `none` | legacy Flash/PDF cross-domain policies |
| `Permissions-Policy` | camera, mic, geolocation … `()` | features the site never uses |
| `Strict-Transport-Security` | 1 year, `includeSubDomains` | TLS stripping — **TLS connections only** |

HSTS is withheld over plain HTTP. A browser ignores it there anyway, and
sending it would claim an enforcement a plain-HTTP install does not have.
`preload` is off by default: submitting a domain to the preload list is close
to irreversible and is the operator's call.

`nosniff` is applied to non-HTML responses too — that is where it matters most.
A streamed PDF or an uploaded image that a browser decides to sniff as HTML
would be attacker-influenced content rendering on our own origin.

### The CSP, and two honest compromises

```
default-src 'self'; base-uri 'self'; object-src 'none';
frame-ancestors 'self'; frame-src 'none'; form-action 'self';
script-src 'self' 'nonce-<per-request>' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'
```

The nonce does the load-bearing work. Every `<script>` the application emits
carries it — the Vite tags, the theme-bootstrap script, the JSON-LD block — so
a script injected through a hole we have not found has no nonce and does not
execute. A test asserts the header nonce and every script tag in the document
agree, because if they ever diverge the browser blocks the entire page.

Two directives are looser than the rest, and both are deliberate:

- **`script-src 'unsafe-eval'`** — Alpine evaluates its `x-*` attribute
  expressions with `new Function()`. The alternative is Alpine's CSP build,
  which forbids inline expressions entirely and would mean rewriting every
  `x-data` in the codebase into a registered component object. The residual
  risk is narrow: `unsafe-eval` only helps an attacker who can already get a
  string into the DOM as an `x-*` attribute, which requires HTML injection —
  and HTML injection is a bug we would be equally exposed to without it. It
  buys an attacker nothing that Blade's escaping is not already the control
  for.
- **`style-src 'unsafe-inline'`** — colour swatches are painted from database
  values through a `style` attribute, and CSP nonces apply to `<style>`
  elements, never to attributes. Those values are validated to
  `/^#[0-9A-Fa-f]{6}$/` on write (`Field::color`) and the column is
  `char(7)`, so the injection this would otherwise permit is closed at the
  source. A style attribute cannot execute script in any browser this project
  targets.

`CSP_REPORT_ONLY=true` swaps the header for `Content-Security-Policy-Report-Only`,
so a policy change can be watched against real traffic before it starts
blocking.

## 5. Input

- **Validation on every write**, through Form Requests or the field
  declarations `CrudController` derives its rules from.
- **CSRF** on every state-changing route, via the framework's `web` group.
- **Honeypot** on both public forms: a `website` field a real person never
  sees, validated `prohibited`. Named innocuously so it does not announce
  itself.
- **Rate limits**: 5 submissions per 10 minutes per IP on the enquiry forms
  (generous enough that a shared office NAT does not lock out a real customer),
  60/min on search.
- **No raw SQL from input.** Filters bind slugs as parameters; the admin search
  escapes `%`, `_` and `\` before a `LIKE`.
- **Output escaping.** Every `{!! !!}` in the codebase wraps `e()` except two:
  the QR code (SVG this application generates from BaconQrCode, no script, no
  external references) and the JSON-LD block (`Js::encode()`, which HEX-escapes
  `<`, `>`, `&`, `'` and `"` so content cannot break out of the tag).

## 6. Uploads

`MediaService` is the only way a file enters the system. Nothing the client
says about a file is believed:

1. MIME type detected from the file's **bytes** (`finfo`), never the submitted
   header.
2. Extension derived from that detected type, never from the submitted
   filename.
3. Type checked against an allow-list (`config/media.accepted`). **SVG is
   deliberately absent** — it is an XML document that can carry script, so
   accepting it would be a stored-XSS vector.
4. Extension checked against a forbidden list as defence in depth, so a file
   that somehow sniffs as an image still cannot be stored as `.php`.
5. Compressed size capped per kind.
6. **Decoded pixel count capped** from the header before any decode — finding 1.
7. Stored under a generated UUID name; the submitted filename never reaches the
   filesystem.

Images live on a public disk because nginx serves them directly. Documents live
on a **private** disk with no public URL and are streamed through a controller —
the catalogue lead form is only a gate if the file cannot be fetched around it.
The download grant is session-scoped and per-catalogue.

## 7. Data at rest

| Data | Protection |
| --- | --- |
| Passwords | bcrypt, cost 12 |
| TOTP secrets, recovery codes | `encrypted` / `encrypted:array` casts, hidden from serialisation |
| Sessions | `SESSION_ENCRYPT=true`, `SameSite=Lax`, `httpOnly`, `secure` on TLS |
| Lead PII (name, phone, email, IP) | Admin-only, behind policy checks |

## 8. Residual risk

Stated plainly, because a security document that lists only what was fixed is
marketing.

- **`unsafe-eval` and `unsafe-inline`** in the CSP, argued above. Both are
  contingent on other controls (Blade escaping, hex validation) holding.
- **No CSP reporting endpoint** is wired by default. `CSP_REPORT_URI` exists;
  nothing consumes it until an operator points it somewhere.
- **No brute-force lockout, only rate limiting.** A permanent lockout is itself
  a denial-of-service vector against a known admin email.
- **Media de-duplication is global by checksum.** Two uploads of identical bytes
  share one record regardless of who uploaded them. Harmless while uploads are
  admin-only; revisit if uploading is ever opened up.
- **`/up` health endpoint is public.** It confirms the app is a Laravel
  application, which a determined observer establishes anyway.
- **TLS is not provisioned by the installer.** `deploy/install-ubuntu.sh` prints
  the certbot invocation and warns while `SESSION_SECURE_COOKIE` is false, but
  it will not obtain a certificate for you.

## 9. Operator checklist

Before a site is considered live:

- [ ] `APP_DEBUG=false` and `APP_ENV=production` (the installer sets both)
- [ ] `APP_KEY` generated
- [ ] TLS certificate installed, `APP_URL` on `https://`
- [ ] `SESSION_SECURE_COOKIE=true` — **the installer cannot set this until TLS
      exists, and warns while it is false**
- [ ] `SESSION_ENCRYPT=true`
- [ ] Seeded admin passwords rotated (the seeder prints them once)
- [ ] 2FA enrolled for every privileged account
- [ ] `TRUSTED_PROXIES` set **only** if a CDN or load balancer was added
- [ ] Check the browser console for CSP violations after any front-end change
