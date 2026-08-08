# استقرار / Deployment

Stage 10. How this application gets onto a server, how a change ships
afterwards, and what to do when one goes wrong.

## 1. Two scripts, two jobs

| | `deploy/install-ubuntu.sh` | `deploy/deploy.sh` |
| --- | --- | --- |
| Runs | once, on a fresh host | on every release after that |
| Touches | packages, MySQL, Redis, Nginx, systemd, `.env` | application code only |
| Needs | `sudo`, a domain | `sudo` |

Keeping them apart is deliberate. A release should not be able to rewrite
`.env`, reinstall MySQL, or regenerate the database password — and a provisioning
run should not be something anyone is tempted to do at 2am to ship a typo fix.

### First install

```bash
sudo DOMAIN=panels.example.com bash deploy/install-ubuntu.sh
```

Installs PHP 8.4 + FPM, Nginx, MySQL 8, Redis, Composer and Node 22; writes
`.env` with a generated database password; migrates; seeds; builds assets;
caches config, routes and views; and registers `panels-queue.service` and
`panels-scheduler.timer`.

It is safe to re-run. An existing `.env` is never overwritten, so generated
passwords survive.

**TLS is not provisioned.** The script prints the `certbot` invocation and warns
while `SESSION_SECURE_COOKIE` is false. Until a certificate exists the site runs
on plain HTTP with non-TLS-only cookies, which is fine for a staging box and not
fine for a live one. See the checklist in §5.

### Every release after that

```bash
sudo bash deploy/deploy.sh                 # deploy the upstream branch
sudo REF=v1.4.0 bash deploy/deploy.sh      # deploy a tag
sudo SKIP_ASSETS=1 bash deploy/deploy.sh   # backend-only change
```

## 2. Why the deploy is ordered the way it is

1. **Maintenance mode**, with a pre-rendered page and a bypass secret, so the
   framework can be replaced underneath it.
2. **Code** — refuses to run if the working tree on the server is dirty. That is
   usually somebody debugging in production, and discarding it silently is
   unkind.
3. **Dependencies** — `--no-dev --optimize-autoloader`.
4. **Migrations**, with caches cleared first. A cached config from the previous
   release can name a different database, and `AdminUserSeeder` refuses to run
   at all while config is cached (see §4).
5. **`optimize`** — re-cache config, routes and views.
6. **`queue:restart`.** The step people miss. A `queue:work` process loads the
   application once and keeps it in memory; without this, image conversions run
   last week's code against this week's database until the worker happens to
   hit its `--max-time=3600`.
7. **`php-fpm reload`** — drop the old opcache.
8. **Maintenance off**, only once every step above has succeeded. If anything
   fails, the trap brings the site back up on the *previous* release rather
   than leaving it dark.

Finally it requests `/up` and fails the release if the site does not answer.

Application caches are not flushed on deploy. `CatalogCache` keys off a version
counter, so catalogue data survives a release; only the compiled artefacts
change.

## 3. What runs in the background

| Unit | Does |
| --- | --- |
| `panels-queue.service` | `queue:work redis --tries=3 --max-time=3600` — image conversions and lead notifications |
| `panels-scheduler.timer` | `schedule:run` every minute |

The schedule itself (`routes/console.php`) is deliberately short, because cache
invalidation is driven by model observers rather than by a clock:

- **`queue:prune-failed`**, weekly. `failed_jobs` is the one table nothing else
  prunes; conversions retry three times and then land there permanently.
- **Sitemap warm**, nightly at 03:10. The sitemap is invalidated by any content
  edit and costs 281ms to rebuild against 600 products versus 2ms warm — the
  visitor who happens to arrive first should not be the one paying that.

```bash
journalctl -u panels-queue -f
systemctl status panels-scheduler.timer
php artisan schedule:list
```

## 4. `env()` does not work in production

The rule that caused the most damage in this project, stated plainly.

Production runs `php artisan optimize`, which caches configuration. Once it is
cached, Laravel **stops parsing `.env` entirely** — `LoadEnvironmentVariables`
returns early. So an `env()` call anywhere outside `config/` returns `null` in
production, and only in production.

This shipped once: `TRUSTED_PROXIES` was read with `env()` in
`bootstrap/app.php`, documented in `docs/SECURITY.md`, and silently did nothing
on a live host. It is now read from `config('security.trusted_proxies')` and
applied in `AppServiceProvider::boot()`, which runs after configuration is
loaded and before any middleware sees a request.

`DeploymentTest` enforces this: it tokenises every file under `app/` and fails
on a call to the `env()` helper, naming the file and line.

The same trap caught `AdminUserSeeder`, which reads `SEED_*_PASSWORD` from the
environment. Seeding runs before `optimize` on a first install, so it works —
but re-run on a provisioned host it would have quietly created a *second* set of
admin accounts at `@example.com` addresses with generated passwords, next to the
real ones. It now refuses to run while config is cached and says what to do.

## 5. Before a site is live

From `docs/SECURITY.md` §9, repeated here because this is the document someone
reads while deploying:

- [ ] `APP_DEBUG=false`, `APP_ENV=production` — the installer sets both
- [ ] `APP_KEY` generated
- [ ] TLS certificate installed, `APP_URL` on `https://`
- [ ] `SESSION_SECURE_COOKIE=true` — **the installer cannot set this until TLS
      exists, and warns while it is false**
- [ ] `SESSION_ENCRYPT=true`
- [ ] Seeded admin passwords rotated — the seeder prints them once
- [ ] TOTP enrolled for every privileged account
- [ ] `TRUSTED_PROXIES` set **only** if a CDN or load balancer was added
- [ ] `LOG_STACK=daily`, `LOG_LEVEL=warning` — the installer sets both;
      `.env.example` ships `single`/`debug`, which is right for development and
      would grow one unbounded file here
- [ ] A database backup exists and has been restored at least once (§7)

## 6. When a deploy goes wrong

The script leaves the site up on the previous release if any step fails. To go
back deliberately:

```bash
sudo REF=<previous-short-sha> bash deploy/deploy.sh
```

The previous SHA is printed at the end of every successful deploy.

**Migrations do not roll back automatically**, and a rollback to code that
predates a migration will meet a schema it does not expect. Prefer
forward-compatible migrations — add a column, deploy, backfill, then stop
reading the old one in a later release — over a `down()` you will be running
under pressure.

```bash
tail -f storage/logs/laravel-$(date +%F).log
journalctl -u panels-queue -n 100 --no-pager
php artisan queue:failed
```

## 7. Not covered here

Named rather than left to be discovered:

- **Backups.** Neither script configures them. `mysqldump` on a timer plus
  off-host copies of `storage/app` is the minimum; a backup nobody has restored
  is not a backup.
- **Zero-downtime deploys.** This takes the site down for the length of a
  release — tens of seconds. Atomic symlink-switched releases would remove
  that, and would need the queue and scheduler units pointed at the shared
  path.
- **Monitoring and alerting.** `/up` answers, but nothing is watching it.
- **Multi-server.** The schedule already uses `onOneServer()`, so it is ready
  for it, but nothing else here assumes more than one host.
- **`ngx_brotli`.** gzip only; see `docs/PERFORMANCE.md` §5.
