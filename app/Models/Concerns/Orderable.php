<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

/**
 * Shared `is_active` / `position` behaviour for the many small
 * editor-ordered lookup tables (colours, decors, surfaces, …).
 */
trait Orderable
{
    public function scopeActive(Builder $query): Builder
    {
        return $query->where("{$query->getModel()->getTable()}.is_active", true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        $table = $query->getModel()->getTable();

        return $query->orderBy("{$table}.position")->orderBy("{$table}.id");
    }
}
