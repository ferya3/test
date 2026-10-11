<?php

declare(strict_types=1);

namespace App\Services\Cache;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * Caches the rendered sitemap XML, using the same version-bump invalidation
 * scheme as CatalogCache: every key embeds a version number, and flushing is a
 * single atomic increment rather than a driver-dependent tag flush.
 *
 * A single global entry rather than one per locale — the sitemap embeds every
 * locale's URLs (as hreflang alternates) in one document.
 */
class SitemapCache
{
    private const string VERSION_KEY = 'sitemap:version';

    public const int TTL = 86400;

    public function version(): int
    {
        return (int) Cache::rememberForever(self::VERSION_KEY, static fn (): int => 1);
    }

    public function flush(): void
    {
        Cache::add(self::VERSION_KEY, 1);
        Cache::increment(self::VERSION_KEY);
    }

    /**
     * @param  Closure(): string  $callback
     * @param  string  $variant  Anything outside the database that changes the
     *                           document, such as a feature flag, so flipping it
     *                           takes effect without waiting out the TTL.
     */
    public function remember(Closure $callback, string $variant = ''): string
    {
        $key = $variant === ''
            ? sprintf('sitemap:v%d:xml', $this->version())
            : sprintf('sitemap:v%d:%s:xml', $this->version(), $variant);

        return Cache::remember($key, self::TTL, $callback);
    }
}
