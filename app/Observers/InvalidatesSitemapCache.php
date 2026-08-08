<?php

declare(strict_types=1);

namespace App\Observers;

use App\Services\Cache\SitemapCache;
use Illuminate\Database\Eloquent\Model;

/**
 * Bumps the sitemap cache version whenever a model that contributes its own
 * URL to the sitemap (a product, category, article, project or editorial
 * page) is saved, deleted or restored.
 */
class InvalidatesSitemapCache
{
    public function __construct(private readonly SitemapCache $cache) {}

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
