<?php

declare(strict_types=1);

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * JSON cast for translatable columns that stores Persian text as-is.
 *
 * Laravel's built-in `array` cast encodes with the default json_encode flags, so
 * "پنل" is written as "پنل": correct, but roughly six times the
 * bytes and unreadable when inspecting the database directly. Persian is the
 * primary language here, so unescaped UTF-8 is the right default.
 *
 * @implements CastsAttributes<array<string, string>, array<string, string>|string>
 */
class TranslatedJson implements CastsAttributes
{
    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, string>
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): array
    {
        if ($value === null) {
            return [];
        }

        $decoded = is_string($value) ? json_decode($value, true) : $value;

        return is_array($decoded) ? array_filter($decoded, 'is_string') : [];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        // A bare string is recorded against the active locale; HasTranslations
        // normalises this before it reaches the cast, but a direct forceFill
        // can still land here.
        if (is_string($value)) {
            $value = [app()->getLocale() => $value];
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
