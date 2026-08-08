<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Observers\InvalidatesCatalogCache;
use App\Observers\InvalidatesSitemapCache;
use Database\Factories\CategoryFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[ObservedBy([InvalidatesCatalogCache::class, InvalidatesSitemapCache::class])]
class Category extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<CategoryFactory> */
    use HasFactory;

    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'short_description', 'description'];

    protected $fillable = [
        'parent_id',
        'slug',
        'name',
        'short_description',
        'description',
        'icon',
        'cover_media_id',
        'position',
        'is_active',
        'is_featured',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => TranslatedJson::class,
            'short_description' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position');
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'cover_media_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function scopeRoots(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('is_featured', true);
    }

    public function isRoot(): bool
    {
        return $this->parent_id === null;
    }

    /**
     * Ancestor chain, root first — used to build breadcrumbs.
     *
     * @return list<self>
     */
    public function ancestors(): array
    {
        $chain = [];
        $node = $this->parent;

        while ($node !== null) {
            array_unshift($chain, $node);
            $node = $node->parent;
        }

        return $chain;
    }

    protected function slugFallback(): string
    {
        return 'category';
    }
}
