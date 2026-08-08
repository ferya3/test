<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Orderable;
use Database\Factories\ThicknessFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property numeric-string $value_mm
 */
class Thickness extends Model
{
    /** @use HasFactory<ThicknessFactory> */
    use HasFactory;

    use Orderable;

    protected $fillable = [
        'value_mm',
        'label',
        'position',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value_mm' => 'decimal:2',
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_thickness');
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('value_mm');
    }

    /**
     * "18 mm" / "۱۸ میلی‌متر" — the editor-supplied label wins when present.
     */
    public function displayLabel(): string
    {
        return $this->label ?? trim($this->trimmedValue().' '.__('units.mm'));
    }

    /**
     * 18.00 → "18", 16.50 → "16.5"
     */
    public function trimmedValue(): string
    {
        return rtrim(rtrim((string) $this->value_mm, '0'), '.');
    }
}
