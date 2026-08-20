<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\HasTranslations;
use App\Observers\InvalidatesCatalogCache;
use Database\Factories\ProductSpecificationFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row of a product's technical specification table.
 */
#[ObservedBy(InvalidatesCatalogCache::class)]
class ProductSpecification extends Model
{
    use Concerns\NormalisesPosition;

    /** @use HasFactory<ProductSpecificationFactory> */
    use HasFactory;

    use HasTranslations;

    /**
     * @var list<string>
     */
    protected array $translatable = ['label', 'value'];

    protected $fillable = [
        'product_id',
        'group',
        'label',
        'value',
        'unit',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'label' => TranslatedJson::class,
            'value' => TranslatedJson::class,
            'position' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * The value with its unit appended, e.g. "18 mm".
     */
    public function displayValue(): string
    {
        $value = $this->translate('value') ?? '';

        return $this->unit === null ? $value : trim("{$value} {$this->unit}");
    }
}
