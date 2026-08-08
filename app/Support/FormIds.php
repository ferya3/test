<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Derives the ids that link a form control to its hint and error text.
 *
 * The field chrome and the control itself are rendered by different Blade
 * components, and a Blade slot evaluates in the caller's scope rather than the
 * component's — so the two cannot share a computed variable. Both derive the
 * ids from here instead, which keeps `aria-describedby` pointing at elements
 * that actually exist.
 */
final class FormIds
{
    public static function hint(string $id): string
    {
        return "{$id}-hint";
    }

    public static function error(string $id): string
    {
        return "{$id}-error";
    }

    /**
     * The space separated `aria-describedby` value for a control.
     *
     * @return string|null null when there is nothing to describe, so the
     *                     attribute can be omitted entirely rather than empty
     */
    public static function describedBy(string $id, bool $hasHint, bool $hasError): ?string
    {
        $ids = array_filter([
            $hasHint && ! $hasError ? self::hint($id) : null,
            $hasError ? self::error($id) : null,
        ]);

        return $ids === [] ? null : implode(' ', $ids);
    }
}
