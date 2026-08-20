<?php

declare(strict_types=1);

namespace App\Models;

use App\Observers\InvalidatesCatalogCache;
use Database\Factories\ProductDimensionFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A stocked sheet size for a product.
 */
#[ObservedBy(InvalidatesCatalogCache::class)]
class ProductDimension extends Model
{
    use Concerns\NormalisesPosition;

    /** @use HasFactory<ProductDimensionFactory> */
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'product_id',
        'width_mm',
        'height_mm',
        'label',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'width_mm' => 'integer',
            'height_mm' => 'integer',
            'position' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * "2800 × 1220 mm", or the editor-supplied label when set.
     */
    public function displayLabel(): string
    {
        if ($this->label !== null && $this->label !== '') {
            return $this->label;
        }

        return "{$this->width_mm} × {$this->height_mm} ".__('units.mm');
    }
}
