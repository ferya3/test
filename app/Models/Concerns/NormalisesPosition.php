<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * A blank ordering means "no preference", not "no value".
 *
 * `position` is NOT NULL DEFAULT 0 on every table that has it. An admin form
 * that leaves the field empty submits "", ConvertEmptyStringsToNull turns that
 * into null, and the insert then names the column explicitly with a null —
 * which MySQL rejects outright while the default sits unused. Every create form
 * in the panel carries this field, so leaving the ordering blank returned a 500
 * on every resource.
 *
 * The suite never saw it: SQLite is the test database, and the tests that
 * create records either supply a position or omit the key, and omitting it is
 * the one case where the column default actually applies.
 */
trait NormalisesPosition
{
    protected function position(): Attribute
    {
        return Attribute::make(
            set: static fn (mixed $value): int => $value === null || $value === '' ? 0 : (int) $value,
        );
    }
}
