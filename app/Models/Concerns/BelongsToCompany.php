<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\Company;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Content that a subsidiary can own. A null `company_id` means the row belongs
 * to the holding itself, not that it is unassigned by mistake.
 */
trait BelongsToCompany
{
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function scopeForCompany(Builder $query, Company|int $company): Builder
    {
        $id = $company instanceof Company ? $company->getKey() : $company;

        return $query->where("{$query->getModel()->getTable()}.company_id", $id);
    }
}
