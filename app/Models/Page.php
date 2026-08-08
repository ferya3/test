<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Observers\InvalidatesSitemapCache;
use App\Support\Enums\PageSectionType;
use App\Support\Enums\PageTemplate;
use Database\Factories\PageFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

/**
 * An editorial page (About Factory, Factory & Production, Production Process,
 * Quality Control). Its body is an ordered list of typed sections.
 */
#[ObservedBy(InvalidatesSitemapCache::class)]
class Page extends Model
{
    /** @use HasFactory<PageFactory> */
    use HasFactory;

    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['title', 'subtitle', 'body'];

    protected $fillable = [
        'slug',
        'template',
        'title',
        'subtitle',
        'body',
        'hero_media_id',
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
            'subtitle' => TranslatedJson::class,
            'body' => TranslatedJson::class,
            'template' => PageTemplate::class,
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function hero(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'hero_media_id');
    }

    public function sections(): HasMany
    {
        return $this->hasMany(PageSection::class)
            ->where('is_active', true)
            ->orderBy('position');
    }

    /**
     * Every section including inactive ones — the admin editor needs these.
     */
    public function allSections(): HasMany
    {
        return $this->hasMany(PageSection::class)->orderBy('position');
    }

    /**
     * @return Collection<int, PageSection>
     */
    public function sectionsOfType(PageSectionType $type): Collection
    {
        return $this->sections
            ->filter(static fn (PageSection $section): bool => $section->type === $type)
            ->values();
    }
}
