<?php

declare(strict_types=1);

namespace App\Observers;

use App\Services\Cache\CatalogCache;
use Illuminate\Database\Eloquent\Model;

/**
 * Bumps the catalogue cache version whenever anything the catalogue pages read
 * changes.
 *
 * Attached to every model that feeds a product listing or facet count, because
 * a stale facet count is both wrong and untraceable — the page renders happily
 * with numbers that no longer match the rows behind them.
 */
class InvalidatesCatalogCache
{
    public function __construct(private readonly CatalogCache $cache) {}

    public function saved(Model $model): void
    {
        $this->cache->flush();
    }

    public function deleted(Model $model): void
    {
        $this->cache->flush();
    }

    public function restored(Model $model): void
    {
        $this->cache->flush();
    }
}
