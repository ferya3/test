<?php

declare(strict_types=1);

namespace App\Services\Localization;

use Illuminate\Support\Facades\URL;

/**
 * Single source of truth for which locales exist, which is active, and what the
 * equivalent URL in another locale looks like.
 *
 * Reads config/localization.php so routes, the language switcher, hreflang tags
 * and the sitemap all agree.
 */
class LocaleManager
{
    /**
     * @return array<string, array<string, string>>
     */
    public function all(): array
    {
        return config('localization.locales', []);
    }

    /**
     * @return list<string>
     */
    public function codes(): array
    {
        return array_keys($this->all());
    }

    public function default(): string
    {
        return (string) config('localization.default', 'fa');
    }

    public function current(): string
    {
        $locale = app()->getLocale();

        return $this->supports($locale) ? $locale : $this->default();
    }

    public function supports(string $locale): bool
    {
        return array_key_exists($locale, $this->all());
    }

    /**
     * @return array<string, string>
     */
    public function config(?string $locale = null): array
    {
        $locale ??= $this->current();

        return $this->all()[$locale] ?? $this->all()[$this->default()] ?? [];
    }

    public function direction(?string $locale = null): string
    {
        return $this->config($locale)['dir'] ?? 'ltr';
    }

    public function isRtl(?string $locale = null): bool
    {
        return $this->direction($locale) === 'rtl';
    }

    public function hreflang(?string $locale = null): string
    {
        return $this->config($locale)['hreflang'] ?? $locale ?? $this->default();
    }

    public function nativeName(?string $locale = null): string
    {
        return $this->config($locale)['native'] ?? strtoupper((string) $locale);
    }

    /**
     * The URL prefix a locale is mounted under; empty for the default locale,
     * which lives at the site root.
     */
    public function prefix(?string $locale = null): string
    {
        return $this->config($locale)['prefix'] ?? '';
    }

    /**
     * An application path resolved for a locale, e.g. '/products' becomes
     * '/products' under Persian and '/en/products' under English.
     *
     * Paths are the stable contract between navigation config and routing.
     */
    public function url(string $path = '/', ?string $locale = null): string
    {
        $prefix = $this->prefix($locale ?? $this->current());
        $path = trim($path, '/');

        $segments = array_filter([$prefix, $path], fn (string $s): bool => $s !== '');

        return URL::to('/'.implode('/', $segments));
    }

    /**
     * The locale a request path belongs to, derived from its first segment.
     */
    public function fromPath(string $path): string
    {
        $first = explode('/', trim($path, '/'))[0] ?? '';

        foreach ($this->all() as $code => $settings) {
            if (($settings['prefix'] ?? '') !== '' && $settings['prefix'] === $first) {
                return $code;
            }
        }

        return $this->default();
    }

    /**
     * The current URL rewritten into another locale, preserving the path after
     * the locale prefix along with the query string.
     *
     * Used by the language switcher and by the hreflang alternates, so a
     * visitor swapping language stays on the same page.
     */
    public function alternateUrl(string $locale, ?string $path = null): string
    {
        $path = $path ?? request()->path();
        $segments = array_values(array_filter(explode('/', trim($path, '/')), fn (string $s): bool => $s !== ''));

        // Drop an existing locale prefix before applying the new one.
        if ($segments !== [] && $this->isPrefix($segments[0])) {
            array_shift($segments);
        }

        $prefix = $this->prefix($locale);

        if ($prefix !== '') {
            array_unshift($segments, $prefix);
        }

        $url = URL::to(implode('/', $segments));
        $query = request()->getQueryString();

        return $query === null || $query === '' ? $url : "{$url}?{$query}";
    }

    private function isPrefix(string $segment): bool
    {
        foreach ($this->all() as $settings) {
            if (($settings['prefix'] ?? '') !== '' && $settings['prefix'] === $segment) {
                return true;
            }
        }

        return false;
    }

    /**
     * Locale code => absolute URL, for hreflang alternates.
     *
     * @return array<string, string>
     */
    public function alternates(?string $path = null): array
    {
        $alternates = [];

        foreach ($this->codes() as $code) {
            $alternates[$code] = $this->alternateUrl($code, $path);
        }

        return $alternates;
    }

    public function xDefault(): string
    {
        return (string) config('localization.x_default', $this->default());
    }
}
