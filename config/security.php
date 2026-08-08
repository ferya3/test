<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Content Security Policy
    |--------------------------------------------------------------------------
    |
    | Assembled by App\Http\Middleware\ContentSecurityPolicy and emitted on HTML
    | responses only. `{nonce}` is replaced with the per-request nonce that
    | AppServiceProvider generates via Vite::useCspNonce() — the same value the
    | @vite tags and the theme bootstrap script already carry.
    |
    | Two directives are deliberately looser than the rest:
    |
    | - script-src carries 'unsafe-eval' because Alpine evaluates its x-* -
    |   attribute expressions with new Function(). The alternative is Alpine's
    |   CSP build, which forbids inline expressions entirely and would mean
    |   rewriting every x-data in the codebase into a registered component.
    |   The nonce still does the load-bearing work: an injected <script> without
    |   it does not run. The residual risk is that HTML injection could smuggle
    |   an x-* attribute past Blade's escaping, which is a bug we would have
    |   regardless of this directive.
    |
    | - style-src carries 'unsafe-inline' because colour swatches are painted
    |   from database values through a style attribute, and CSP nonces do not
    |   apply to attributes — only to <style> elements. Those values are
    |   validated to /^#[0-9A-Fa-f]{6}$/ on write, and a style attribute cannot
    |   execute script in any browser this project supports.
    |
    */

    'csp' => [

        'enabled' => env('CSP_ENABLED', true),

        /*
         * Report-only sends Content-Security-Policy-Report-Only instead, so a
         * policy change can be observed in the browser console against real
         * traffic before it starts blocking anything.
         */
        'report_only' => env('CSP_REPORT_ONLY', false),

        'report_uri' => env('CSP_REPORT_URI'),

        'directives' => [
            'default-src' => ["'self'"],
            'base-uri' => ["'self'"],
            'object-src' => ["'none'"],
            'frame-ancestors' => ["'self'"],
            'frame-src' => ["'none'"],
            'form-action' => ["'self'"],
            'script-src' => ["'self'", "'nonce-{nonce}'", "'unsafe-eval'"],
            'style-src' => ["'self'", "'unsafe-inline'"],
            'img-src' => ["'self'", 'data:'],
            'font-src' => ["'self'"],
            'connect-src' => ["'self'"],
            'manifest-src' => ["'self'"],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Response headers
    |--------------------------------------------------------------------------
    |
    | Set by the application rather than left to the web server. The nginx site
    | that deploy/install-ubuntu.sh writes sets three of these too, which is
    | belt and braces on that host — but the app is also served by `artisan
    | serve` in development and may sit behind a different front end tomorrow,
    | and a security header that only exists in one deployment's nginx config
    | is a security header nobody can rely on.
    |
    */

    'headers' => [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'SAMEORIGIN',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Cross-Origin-Opener-Policy' => 'same-origin',
        'X-Permitted-Cross-Domain-Policies' => 'none',

        /*
         * No camera, microphone, geolocation or FLoC/Topics participation.
         * The representative locator links out to a map rather than embedding
         * one, so the site never needs the geolocation permission itself.
         */
        'Permissions-Policy' => 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    ],

    /*
    |--------------------------------------------------------------------------
    | HSTS
    |--------------------------------------------------------------------------
    |
    | Only ever sent over a TLS connection: a browser ignores the header on
    | plain HTTP anyway, and emitting it there would only misrepresent what the
    | install actually enforces. Preload stays off by default — submitting a
    | domain to the preload list is close to irreversible and is the operator's
    | decision, not a framework default.
    |
    */

    'hsts' => [
        'enabled' => env('HSTS_ENABLED', true),
        'max_age' => env('HSTS_MAX_AGE', 31536000),
        'include_subdomains' => env('HSTS_INCLUDE_SUBDOMAINS', true),
        'preload' => env('HSTS_PRELOAD', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Trusted proxies
    |--------------------------------------------------------------------------
    |
    | Empty by default. Nginx reaches PHP-FPM over FastCGI, which passes the
    | real client address in REMOTE_ADDR, so nothing needs trusting. Put a CDN
    | or a load balancer in front and that stops being true: every request would
    | appear to come from the proxy, collapsing all the IP-keyed rate limits
    | into one bucket a single client could exhaust for everybody. Set
    | TRUSTED_PROXIES then — a comma-separated list of proxy addresses, or '*'
    | when the proxy is the only possible ingress.
    |
    | This lives in config rather than being read from env at boot: production
    | runs `php artisan optimize`, and once configuration is cached Laravel
    | stops parsing .env altogether, so an env() call outside a config file
    | quietly returns null. Applied in AppServiceProvider::boot(), which runs
    | after configuration is loaded and before any middleware sees a request.
    |
    */

    'trusted_proxies' => env('TRUSTED_PROXIES'),

];
