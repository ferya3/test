<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use Database\Factories\SurfaceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Surface extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<SurfaceFactory> */
    use HasFactory;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'description'];

    protected $fillable = [
        'slug',
        'name',
        'description',
        'gloss_level',
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
            'description' => TranslatedJson::class,
            'gloss_level' => 'integer',
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    protected function slugFallback(): string
    {
        return 'surface';
    }
}
