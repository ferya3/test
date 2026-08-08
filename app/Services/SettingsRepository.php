<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

/**
 * Site-wide settings, read through one cached blob.
 *
 * The header, footer and contact page all read several settings each; querying
 * them row by row from a view would add a query per lookup on every request.
 * The whole table is small, so it is cached as a single array and invalidated
 * on write.
 */
class SettingsRepository
{
    private const string CACHE_KEY = 'settings.all';

    /**
     * Resolved once per request on top of the cache, so repeated lookups within
     * a single render do not re-enter the cache driver.
     *
     * @var array<string, mixed>|null
     */
    private ?array $resolved = null;

    public function all(): array
    {
        return $this->resolved ??= Cache::rememberForever(
            self::CACHE_KEY,
            static fn (): array => Setting::query()->pluck('value', 'key')->all(),
        );
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->all());
    }

    /**
     * A setting whose value is a {"fa": …, "en": …} map, resolved for the
     * active locale with the same fallback order the models use.
     */
    public function translated(string $key, ?string $locale = null): ?string
    {
        $value = $this->get($key);

        if (is_string($value)) {
            return $value;
        }

        if (! is_array($value)) {
            return null;
        }

        $candidates = array_unique(array_filter([
            $locale ?? app()->getLocale(),
            config('app.fallback_locale'),
            config('localization.default', 'fa'),
        ]));

        foreach ($candidates as $candidate) {
            if (is_string($value[$candidate] ?? null) && $value[$candidate] !== '') {
                return $value[$candidate];
            }
        }

        return null;
    }

    /**
     * Only settings marked public, for anything exposed to the frontend.
     *
     * @return array<string, mixed>
     */
    public function publicOnly(): array
    {
        $keys = Cache::rememberForever(
            self::CACHE_KEY.'.public',
            static fn (): array => Setting::query()->public()->pluck('key')->all(),
        );

        return array_intersect_key($this->all(), array_flip($keys));
    }

    public function flush(): void
    {
        $this->resolved = null;

        Cache::forget(self::CACHE_KEY);
        Cache::forget(self::CACHE_KEY.'.public');
    }
}
