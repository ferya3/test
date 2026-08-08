<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Support\Slug;
use Spatie\Sluggable\HasSlug;
use Spatie\Sluggable\SlugOptions;

/**
 * Shared slug generation: prefer the English translation so the URL is readable
 * latin, otherwise transliterate the Persian one.
 *
 * Slugs are not regenerated on update — a published URL must not move by itself.
 */
trait GeneratesSlug
{
    use HasSlug;

    public function getSlugOptions(): SlugOptions
    {
        return SlugOptions::create()
            ->generateSlugsFrom(fn (self $model): string => Slug::make(
                $model->slugSource(),
                $model->slugFallback(),
            ))
            ->saveSlugsTo('slug')
            ->doNotGenerateSlugsOnUpdate();
    }

    /**
     * The text a slug is derived from. Models with a differently named title
     * column override this.
     */
    protected function slugSource(): string
    {
        $attribute = $this->slugSourceAttribute();

        return $this->translate($attribute, 'en')
            ?? $this->translate($attribute)
            ?? $this->slugFallback();
    }

    protected function slugSourceAttribute(): string
    {
        return 'name';
    }

    protected function slugFallback(): string
    {
        return class_basename($this);
    }
}
