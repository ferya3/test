<?php

declare(strict_types=1);

namespace App\Models;

use App\Observers\SettingObserver;
use Database\Factories\SettingFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Site-wide configuration. Read through App\Services\SettingsRepository, which
 * caches the whole table as one blob — never queried row by row from a view.
 */
#[ObservedBy(SettingObserver::class)]
class Setting extends Model
{
    /** @use HasFactory<SettingFactory> */
    use HasFactory;

    protected $fillable = [
        'key',
        'value',
        'group',
        'is_public',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'array',
            'is_public' => 'boolean',
        ];
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->where('is_public', true);
    }

    public function scopeInGroup(Builder $query, string $group): Builder
    {
        return $query->where('group', $group);
    }

    /**
     * Whether the admin should offer a textarea rather than a single-line input.
     *
     * Decided here rather than in the Blade template: which settings hold prose
     * is a property of the setting, and the view has no business knowing the
     * naming convention. A `_body` value is the several paragraphs of an
     * introduction, which is unusable in a one-line field.
     */
    public function isLongText(): bool
    {
        return str_ends_with($this->key, '_body')
            || str_ends_with($this->key, '_description');
    }

    /**
     * Whether this setting holds a media id rather than a value to be typed.
     *
     * Same reasoning as isLongText(): which settings point at the media library
     * is a property of the setting. Without this the admin rendered a plain text
     * box for `seo_default_og_media_id` and expected an operator to know, and
     * type, the numeric id of a row in another table.
     */
    public function isMedia(): bool
    {
        return str_ends_with($this->key, '_media_id');
    }

    /**
     * Human label for the admin, falling back to the key.
     *
     * The panel used to print the raw key for every field — `home_intro_overline`
     * above the box you type the homepage overline into. The fallback keeps a
     * newly seeded setting visible and editable before anyone writes its label,
     * rather than rendering a blank label nobody can identify.
     */
    public function label(): string
    {
        $key = "admin.settings.{$this->key}";

        return __($key) === $key ? $this->key : __($key);
    }

    /**
     * One line saying where the setting shows up, or null when it needs none.
     */
    public function hint(): ?string
    {
        $key = "admin.settings_hint.{$this->key}";

        return __($key) === $key ? null : __($key);
    }
}
