<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\HasTranslations;
use Database\Factories\SeoMetadataFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Per-entity SEO overrides. A null value means "derive it from the model",
 * which keeps the table sparse and the defaults sensible.
 */
class SeoMetadata extends Model
{
    /** @use HasFactory<SeoMetadataFactory> */
    use HasFactory;

    use HasTranslations;

    protected $table = 'seo_metadata';

    /**
     * @var list<string>
     */
    protected array $translatable = [
        'title',
        'description',
        'keywords',
        'og_title',
        'og_description',
    ];

    protected $fillable = [
        'title',
        'description',
        'keywords',
        'canonical_url',
        'og_title',
        'og_description',
        'og_media_id',
        'twitter_card',
        'robots',
        'structured_data',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'keywords' => TranslatedJson::class,
            'og_title' => TranslatedJson::class,
            'og_description' => TranslatedJson::class,
            'structured_data' => 'array',
        ];
    }

    public function seoable(): MorphTo
    {
        return $this->morphTo();
    }

    public function ogImage(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'og_media_id');
    }
}
