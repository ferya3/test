<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use Database\Factories\RepresentativeFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Representative extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<RepresentativeFactory> */
    use HasFactory;

    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'company', 'address'];

    protected $fillable = [
        'slug',
        'name',
        'company',
        'province',
        'city',
        'address',
        'phone',
        'mobile',
        'email',
        'website',
        'latitude',
        'longitude',
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
            'name' => TranslatedJson::class,
            'company' => TranslatedJson::class,
            'address' => TranslatedJson::class,
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function scopeInProvince(Builder $query, string $province): Builder
    {
        return $query->where('province', $province);
    }

    public function scopeInCity(Builder $query, string $city): Builder
    {
        return $query->where('city', $city);
    }

    public function hasCoordinates(): bool
    {
        return $this->latitude !== null && $this->longitude !== null;
    }

    protected function slugFallback(): string
    {
        return 'representative';
    }
}
