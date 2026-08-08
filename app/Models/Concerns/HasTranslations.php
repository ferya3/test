<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Support\Arr;

/**
 * Stores translatable text in a JSON column shaped {"fa": "…", "en": "…"}.
 *
 * Reading `$model->name` returns the string for the active locale, falling back
 * to the configured fallback locale, then to the Persian default, then to any
 * populated value — so a page never renders an empty heading because a
 * translation has not been supplied yet.
 *
 * Raw access stays available through getTranslations()/setTranslation().
 *
 * Implementing models declare:
 *
 *     protected array $translatable = ['name', 'description'];
 *
 * and cast those same attributes to 'array'.
 */
trait HasTranslations
{
    /**
     * @return list<string>
     */
    public function translatableAttributes(): array
    {
        return $this->translatable ?? [];
    }

    public function isTranslatableAttribute(string $key): bool
    {
        return in_array($key, $this->translatableAttributes(), true);
    }

    public function getAttributeValue($key)
    {
        if (! $this->isTranslatableAttribute($key)) {
            return parent::getAttributeValue($key);
        }

        return $this->translate($key);
    }

    public function setAttribute($key, $value)
    {
        // Assigning a bare string is a convenience for factories and seeders:
        // it is recorded against the currently active locale.
        if ($this->isTranslatableAttribute($key) && is_string($value)) {
            $value = [app()->getLocale() => $value];
        }

        return parent::setAttribute($key, $value);
    }

    public function translate(string $key, ?string $locale = null): ?string
    {
        $translations = $this->getTranslations($key);

        if ($translations === []) {
            return null;
        }

        foreach ($this->localePreference($locale) as $candidate) {
            $value = $translations[$candidate] ?? null;

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        $first = Arr::first($translations, static fn ($value): bool => is_string($value) && $value !== '');

        return is_string($first) ? $first : null;
    }

    /**
     * @return array<string, string>
     */
    public function getTranslations(string $key): array
    {
        $value = $this->attributes[$key] ?? null;

        if ($value === null) {
            return [];
        }

        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        return is_array($value) ? array_filter($value, 'is_string') : [];
    }

    public function setTranslation(string $key, string $locale, ?string $value): static
    {
        $translations = $this->getTranslations($key);

        if ($value === null || $value === '') {
            unset($translations[$locale]);
        } else {
            $translations[$locale] = $value;
        }

        $this->attributes[$key] = json_encode($translations, JSON_UNESCAPED_UNICODE);

        return $this;
    }

    /**
     * @param  array<string, string|null>  $values
     */
    public function setTranslations(string $key, array $values): static
    {
        foreach ($values as $locale => $value) {
            $this->setTranslation($key, $locale, $value);
        }

        return $this;
    }

    /**
     * Every locale in which any translatable attribute carries text. Used by the
     * sitemap builder to decide which hreflang alternates actually exist.
     *
     * @return list<string>
     */
    public function translatedLocales(): array
    {
        $locales = [];

        foreach ($this->translatableAttributes() as $attribute) {
            $locales = [...$locales, ...array_keys($this->getTranslations($attribute))];
        }

        return array_values(array_unique($locales));
    }

    /**
     * @return list<string>
     */
    protected function localePreference(?string $locale): array
    {
        return array_values(array_unique(array_filter([
            $locale ?? app()->getLocale(),
            config('app.fallback_locale'),
            config('localization.default', 'fa'),
        ])));
    }
}
