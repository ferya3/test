<?php

declare(strict_types=1);

namespace App\Providers;

use App\Services\Cache\CatalogCache;
use App\Services\Localization\LocaleManager;
use App\Services\SettingsRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\View\View as ViewContract;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One instance per request: the manager is stateless config reading, and
        // the language switcher, hreflang tags and sitemap all consult it.
        $this->app->singleton(LocaleManager::class);

        // Singleton so the per-request memo inside it actually holds; a fresh
        // instance per injection would re-enter the cache driver each time.
        $this->app->singleton(SettingsRepository::class);

        // Same reason: CatalogCache memoises the cache version, and the version
        // is read once per cached lookup. Injected into ProductQuery and the
        // controllers, which would otherwise each get their own memo.
        $this->app->singleton(CatalogCache::class);
    }

    public function boot(): void
    {
        // Generates a per-request nonce, applied automatically to the tags @vite
        // renders and readable via Vite::cspNonce() for inline scripts. The CSP
        // header that consumes it is added by middleware in the security stage.
        Vite::useCspNonce();

        // Prefetch built assets on idle so navigating from the first page does
        // not pay for chunks the browser could already have.
        Vite::prefetch(concurrency: 3);

        // Pagination uses the design system's own markup rather than the
        // framework default, so RTL chevrons and focus rings match everything else.
        Paginator::defaultView('vendor.pagination.design-system');

        $this->configureModels();
        $this->configureRateLimiting();
        $this->configureTrustedProxies();
        $this->shareBrand();
    }

    /**
     * The company name shown in the header, the footer and the copyright line.
     *
     * It comes from settings, so the factory can change it in the admin —
     * `config('app.name')` is the framework's name for the application, and
     * leaving the wordmark bound to it is why a fresh install says "Laravel"
     * across the top of the site. Shared through a composer rather than fetched
     * inside each partial so the settings blob is read once.
     */
    private function shareBrand(): void
    {
        View::composer([
            'partials.header',
            'partials.footer',
            'components.layouts.app',
            'components.layouts.admin',
            'components.layouts.admin-auth',
        ], function (ViewContract $view): void {
            $settings = $this->app->make(SettingsRepository::class);
            $name = $settings->translated('company_name') ?? config('app.name');

            $view->with([
                'brandName' => $name,
                // First grapheme, not first byte: a Persian name would
                // otherwise render half a character.
                'brandMonogram' => mb_substr(trim($name), 0, 1),
            ]);
        });
    }

    /**
     * Applied here rather than in bootstrap/app.php's withMiddleware closure,
     * which runs before configuration is loaded — where an env() read returns
     * null as soon as `php artisan optimize` has cached the config, silently
     * disabling the setting in production and nowhere else. Provider boot runs
     * after configuration is available and before any middleware handles a
     * request.
     */
    private function configureTrustedProxies(): void
    {
        $proxies = config('security.trusted_proxies');

        if (! is_string($proxies) || $proxies === '') {
            return;
        }

        TrustProxies::at($proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
    }

    private function configureRateLimiting(): void
    {
        /*
         * Public enquiry forms. Keyed by IP, which is the only stable
         * identifier for an anonymous visitor — deliberately generous enough
         * that a shared office NAT does not lock a real customer out, and
         * tight enough that a script cannot flood the sales inbox.
         */
        RateLimiter::for('forms', static fn (Request $request): Limit => Limit::perMinutes(
            decayMinutes: 10,
            maxAttempts: 5,
        )->by($request->ip() ?? 'unknown'));

        /*
         * Search and filtering are read-only but hit the database on every
         * request, so a crawler walking every filter permutation is throttled
         * well above what a person browsing could reach.
         */
        RateLimiter::for('search', static fn (Request $request): Limit => Limit::perMinute(60)
            ->by($request->ip() ?? 'unknown'));
    }

    private function configureModels(): void
    {
        // Fail loudly on an unguarded lazy load outside production, so an N+1
        // introduced in a controller surfaces in development and CI rather than
        // silently degrading a live page.
        Model::preventLazyLoading(! $this->app->isProduction());

        // Accessing an attribute the query did not select is a bug, not a null.
        Model::preventAccessingMissingAttributes(! $this->app->isProduction());
    }
}
