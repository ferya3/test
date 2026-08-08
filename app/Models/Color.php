<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use App\Support\Enums\ColorFamily;
use Database\Factories\ColorFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Color extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<ColorFactory> */
    use HasFactory;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name'];

    protected $fillable = [
        'slug',
        'name',
        'hex',
        'color_family',
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
            'color_family' => ColorFamily::class,
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function swatch(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'media_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    protected function slugFallback(): string
    {
        return 'color';
    }
}
