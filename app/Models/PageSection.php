<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\HasTranslations;
use App\Support\Enums\PageSectionType;
use Database\Factories\PageSectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A typed content block on an editorial page. `data` carries the payload the
 * block's type needs — stat values, CTA targets, timeline years.
 */
class PageSection extends Model
{
    /** @use HasFactory<PageSectionFactory> */
    use HasFactory;

    use HasTranslations;

    /**
     * @var list<string>
     */
    protected array $translatable = ['heading', 'subheading', 'body'];

    protected $fillable = [
        'page_id',
        'type',
        'heading',
        'subheading',
        'body',
        'media_id',
        'data',
        'position',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'heading' => TranslatedJson::class,
            'subheading' => TranslatedJson::class,
            'body' => TranslatedJson::class,
            'data' => 'array',
            'type' => PageSectionType::class,
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function page(): BelongsTo
    {
        return $this->belongsTo(Page::class);
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'media_id');
    }

    /**
     * Read one key out of the type-specific payload.
     */
    public function payload(string $key, mixed $default = null): mixed
    {
        return data_get($this->data, $key, $default);
    }

    /**
     * A payload value that may itself be translated, e.g. a CTA label.
     */
    public function translatedPayload(string $key): ?string
    {
        $value = $this->payload($key);

        if (is_string($value)) {
            return $value;
        }

        if (! is_array($value)) {
            return null;
        }

        foreach ([app()->getLocale(), config('app.fallback_locale'), 'fa'] as $locale) {
            if (is_string($value[$locale] ?? null) && $value[$locale] !== '') {
                return $value[$locale];
            }
        }

        return null;
    }
}
