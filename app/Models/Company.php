<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Observers\InvalidatesSitemapCache;
use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One of the holding's subsidiaries.
 *
 * Content that belongs to a factory — its products, projects, certificates,
 * catalogues and news — points here through a nullable `company_id`. A null
 * there means the row belongs to the holding itself.
 *
 * @property string $slug
 * @property string|null $accent_hex
 * @property bool $is_active
 */
#[ObservedBy(InvalidatesSitemapCache::class)]
class Company extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<CompanyFactory> */
    use HasFactory;

    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'tagline', 'sector', 'summary', 'body', 'location', 'capacity'];

    protected $fillable = [
        'slug',
        'name',
        'tagline',
        'sector',
        'summary',
        'body',
        'location',
        'founded_year',
        'employees',
        'site_area_sqm',
        'capacity',
        'accent_hex',
        'logo_media_id',
        'cover_media_id',
        'website_url',
        'email',
        'phone',
        'is_active',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => TranslatedJson::class,
            'tagline' => TranslatedJson::class,
            'sector' => TranslatedJson::class,
            'summary' => TranslatedJson::class,
            'body' => TranslatedJson::class,
            'location' => TranslatedJson::class,
            'capacity' => TranslatedJson::class,
            'founded_year' => 'integer',
            'employees' => 'integer',
            'site_area_sqm' => 'integer',
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function logo(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'logo_media_id');
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'cover_media_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    public function catalogs(): HasMany
    {
        return $this->hasMany(Catalog::class);
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class);
    }

    /**
     * The accent as a CSS custom property declaration, or null.
     *
     * Rendered into a style attribute, which is why it is re-validated here
     * and not only on write: a value that reached the column some other way
     * (a seeder, a console session, an import) must still not be able to
     * close the declaration and add its own.
     */
    public function accentStyle(): ?string
    {
        $hex = $this->accent_hex;

        return is_string($hex) && preg_match('/^#[0-9A-Fa-f]{6}$/', $hex) === 1
            ? "--company-accent: {$hex};"
            : null;
    }

    protected function slugSourceAttribute(): string
    {
        return 'name';
    }

    protected function slugFallback(): string
    {
        return 'company';
    }
}
