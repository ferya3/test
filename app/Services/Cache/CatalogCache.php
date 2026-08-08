<?php

declare(strict_types=1);

namespace App\Services\Cache;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * Caching for the read-heavy catalogue pages, with a version-based invalidation
 * scheme that works on any cache driver.
 *
 * Redis supports tags, but tag flushing is a scan-and-delete that gets slower as
 * the keyspace grows, and the whole scheme breaks on the array/file drivers used
 * in tests and small deployments. Instead every key embeds a version number;
 * bumping the version orphans the old keys, which then expire on their own TTL.
 * Invalidation is therefore a single atomic increment.
 */
class CatalogCache
{
    private const string VERSION_KEY = 'catalog:version';

    /**
     * Facet counts are the expensive part of the products page — seven grouped
     * aggregate queries per request — and change only when the catalogue does.
     */
    public const int FACET_TTL = 3600;

    public const int LISTING_TTL = 900;

    public const int NAVIGATION_TTL = 86400;

    /**
     * Resolved once per request. Every key() call needs the version, and key()
     * is called once per remember() — so without this the products page paid a
     * second cache round-trip for each of its cached reads just to re-read a
     * number that cannot change mid-request.
     */
    private ?int $version = null;

    public function version(): int
    {
        return $this->version ??= (int) Cache::rememberForever(self::VERSION_KEY, static fn (): int => 1);
    }

    /**
     * Invalidate everything catalogue-related in one atomic step.
     */
    public function flush(): void
    {
        // add() then increment() so a cold cache does not start from zero and
        // silently reuse keys written under a previous version.
        Cache::add(self::VERSION_KEY, 1);
        Cache::increment(self::VERSION_KEY);

        // The memo would otherwise hand out the pre-flush version for the rest
        // of this request, writing new values under keys just orphaned.
        $this->version = null;
    }

    /**
     * @template TValue
     *
     * @param  Closure(): TValue  $callback
     * @return TValue
     */
    public function remember(string $key, int $ttl, Closure $callback): mixed
    {
        if (! $this->enabled()) {
            return $callback();
        }

        return Cache::remember($this->key($key), $ttl, $callback);
    }

    public function key(string $key): string
    {
        return sprintf('catalog:v%d:%s:%s', $this->version(), app()->getLocale(), $key);
    }

    /**
     * Driven by config alone rather than by sniffing the environment, so a test
     * can exercise the cached path deliberately. phpunit.xml turns it off by
     * default: a stale facet count is far harder to debug than a slightly
     * slower suite.
     */
    public function enabled(): bool
    {
        return (bool) config('cache.catalog_enabled', true);
    }
}
