<?php

declare(strict_types=1);

use App\Services\Localization\LocaleManager;

if (! function_exists('lroute')) {
    /**
     * Resolve a route name in the active locale.
     *
     * Every page route is registered twice — once at the site root for Persian
     * and once under /en for English — with names scoped by locale ("fa.products",
     * "en.products"). An optional {locale?} prefix segment cannot express this:
     * Laravel reads the first segment of "/products" as the locale, fails the
     * constraint and returns 404, so the unprefixed default locale never matches
     * anything beyond "/".
     *
     * @param  array<string, mixed>  $parameters
     */
    function lroute(string $name, array $parameters = [], ?string $locale = null): string
    {
        $locale ??= app(LocaleManager::class)->current();

        return route("{$locale}.{$name}", $parameters);
    }
}

if (! function_exists('lroute_is')) {
    /**
     * Whether the current request matches a locale-scoped route name pattern.
     *
     * Accepts the unscoped name, e.g. lroute_is('products.*').
     */
    function lroute_is(string ...$patterns): bool
    {
        $locale = app(LocaleManager::class)->current();

        return request()->routeIs(
            ...array_map(static fn (string $pattern): string => "{$locale}.{$pattern}", $patterns)
        );
    }
}
