<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Observers\InvalidatesCatalogCache;
use App\Support\Enums\DecorFamily;
use Database\Factories\DecorFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[ObservedBy(InvalidatesCatalogCache::class)]
class Decor extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<DecorFactory> */
    use HasFactory;

    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'description'];

    protected $fillable = [
        'slug',
        'name',
        'code',
        'description',
        'decor_family',
        'media_id',
        'position',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'decor_family' => DecorFamily::class,
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'media_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    protected function slugFallback(): string
    {
        return 'decor';
    }
}
