<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Observers\InvalidatesCatalogCache;
use App\Observers\InvalidatesSitemapCache;
use App\Observers\ProductObserver;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * One row per panel SKU: a specific decor, in a specific colour, on a specific
 * substrate, with a specific finish.
 *
 * @property string $slug
 * @property string $code
 * @property bool $is_active
 * @property Carbon|null $published_at
 */
#[ObservedBy([ProductObserver::class, InvalidatesCatalogCache::class, InvalidatesSitemapCache::class])]
class Product extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    use HasSeoMetadata;
    use HasTranslations;
    use SoftDeletes;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'short_description', 'description'];

    protected $fillable = [
        'slug',
        'code',
        'category_id',
        'material_id',
        'surface_id',
        'decor_id',
        'color_id',
        'name',
        'short_description',
        'description',
        'main_media_id',
        'datasheet_media_id',
        'is_active',
        'is_featured',
        'position',
        'published_at',
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
            'view_count' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    // ---------------------------------------------------------------------
    // Relationships
    // ---------------------------------------------------------------------

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(Material::class);
    }

    public function surface(): BelongsTo
    {
        return $this->belongsTo(Surface::class);
    }

    public function decor(): BelongsTo
    {
        return $this->belongsTo(Decor::class);
    }

    public function color(): BelongsTo
    {
        return $this->belongsTo(Color::class);
    }

    public function mainImage(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'main_media_id');
    }

    public function datasheet(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'datasheet_media_id');
    }

    public function gallery(): BelongsToMany
    {
        return $this->belongsToMany(Media::class, 'product_media')
            ->withPivot('position')
            ->orderBy('product_media.position');
    }

    public function thicknesses(): BelongsToMany
    {
        return $this->belongsToMany(Thickness::class, 'product_thickness')
            ->orderBy('thicknesses.value_mm');
    }

    public function applications(): BelongsToMany
    {
        return $this->belongsToMany(Application::class)
            ->orderBy('applications.position');
    }

    public function dimensions(): HasMany
    {
        return $this->hasMany(ProductDimension::class)->orderBy('position');
    }

    public function specifications(): HasMany
    {
        return $this->hasMany(ProductSpecification::class)->orderBy('position');
    }

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class);
    }

    /**
     * Curated related products. The pivot is directional so an editor controls
     * exactly what shows on each product page.
     */
    public function relatedProducts(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'product_related', 'product_id', 'related_product_id')
            ->withPivot('position')
            ->orderBy('product_related.position');
    }

    // ---------------------------------------------------------------------
    // Scopes
    // ---------------------------------------------------------------------

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('products.is_active', true);
    }

    /**
     * Active and past its publication date — what the public may see.
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->active()->where(function (Builder $query): void {
            $query->whereNull('products.published_at')
                ->orWhere('products.published_at', '<=', now());
        });
    }

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('products.is_featured', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('products.position')->orderByDesc('products.id');
    }

    // ---------------------------------------------------------------------
    // Presentation helpers
    // ---------------------------------------------------------------------

    public function isPublished(): bool
    {
        return $this->is_active
            && ($this->published_at === null || $this->published_at->isPast());
    }

    public function hasDatasheet(): bool
    {
        return $this->datasheet_media_id !== null;
    }

    /**
     * "2800 × 1220 mm" for each stocked sheet size.
     *
     * @return list<string>
     */
    public function dimensionLabels(): array
    {
        return $this->dimensions
            ->map(fn (ProductDimension $dimension): string => $dimension->displayLabel())
            ->all();
    }

    /**
     * Specifications grouped by their spec-sheet section, preserving order.
     * Ungrouped rows collect under an empty key.
     *
     * @return array<string, list<ProductSpecification>>
     */
    public function groupedSpecifications(): array
    {
        return $this->specifications
            ->groupBy(fn (ProductSpecification $specification): string => $specification->group ?? '')
            ->map(fn ($group): array => $group->values()->all())
            ->all();
    }

    protected function slugSourceAttribute(): string
    {
        return 'name';
    }

    protected function slugFallback(): string
    {
        // The product code is unique, so it always yields a usable URL.
        return $this->code !== '' ? $this->code : 'product';
    }
}
