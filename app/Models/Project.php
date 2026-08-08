<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Support\Enums\ProjectType;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Project extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<ProjectFactory> */
    use HasFactory;
    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['title', 'client', 'location', 'summary', 'body'];

    protected $fillable = [
        'slug',
        'title',
        'client',
        'location',
        'summary',
        'body',
        'cover_media_id',
        'year',
        'area_sqm',
        'project_type',
        'completed_at',
        'is_active',
        'is_featured',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => TranslatedJson::class,
            'client' => TranslatedJson::class,
            'location' => TranslatedJson::class,
            'summary' => TranslatedJson::class,
            'body' => TranslatedJson::class,
            'project_type' => ProjectType::class,
            'completed_at' => 'date',
            'year' => 'integer',
            'area_sqm' => 'integer',
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'cover_media_id');
    }

    public function gallery(): BelongsToMany
    {
        return $this->belongsToMany(Media::class, 'project_media')
            ->withPivot('position')
            ->orderBy('project_media.position');
    }

    /**
     * Panels specified on this project — links the case study back to the catalogue.
     */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class);
    }

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('projects.is_featured', true);
    }

    protected function slugSourceAttribute(): string
    {
        return 'title';
    }

    protected function slugFallback(): string
    {
        return 'project';
    }
}
