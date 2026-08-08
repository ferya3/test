<?php

declare(strict_types=1);

namespace App\Providers;

use App\Services\Localization\LocaleManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One instance per request: the manager is stateless config reading, and
        // the language switcher, hreflang tags and sitemap all consult it.
        $this->app->singleton(LocaleManager::class);
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

        $this->configureModels();
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
