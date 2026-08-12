<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use Database\Factories\CatalogFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A downloadable PDF catalogue. When `requires_registration` is set the file is
 * only released after the lead form is completed.
 *
 * @property bool $requires_registration
 */
class Catalog extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<CatalogFactory> */
    use HasFactory;

    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['title', 'description'];

    protected $fillable = [
        'slug',
        'title',
        'description',
        'cover_media_id',
        'file_media_id',
        'version',
        'published_at',
        'requires_registration',
        'is_active',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'published_at' => 'datetime',
            'requires_registration' => 'boolean',
            'is_active' => 'boolean',
            'position' => 'integer',
            'download_count' => 'integer',
        ];
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'cover_media_id');
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'file_media_id');
    }

    public function requests(): HasMany
    {
        return $this->hasMany(CatalogRequest::class);
    }

    /**
     * Only catalogues that actually have a file attached are downloadable.
     */
    public function scopeDownloadable(Builder $query): Builder
    {
        return $query->whereNotNull('file_media_id');
    }

    public function isDownloadable(): bool
    {
        return $this->file_media_id !== null;
    }

    protected function slugSourceAttribute(): string
    {
        return 'title';
    }

    protected function slugFallback(): string
    {
        return 'catalog';
    }
}
