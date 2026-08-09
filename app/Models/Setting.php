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
}
