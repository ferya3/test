<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Models\Product;
use App\Models\ProductDimension;
use App\Models\ProductSpecification;
use Illuminate\Support\Facades\DB;

/**
 * Writes for the catalogue.
 *
 * A product edit touches seven tables — the row itself, three pivots, sheet
 * sizes, specifications and SEO metadata — so every write is wrapped in a
 * transaction. A half-applied edit that drops a product's thicknesses while
 * keeping its new name is worse than a failed one.
 */
class ProductService
{
    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<string, mixed>  $relations
     */
    public function create(array $attributes, array $relations = []): Product
    {
        return DB::transaction(function () use ($attributes, $relations): Product {
            $product = Product::create($attributes);

            $this->syncRelations($product, $relations);

            return $product->refresh();
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<string, mixed>  $relations
     */
    public function update(Product $product, array $attributes, array $relations = []): Product
    {
        return DB::transaction(function () use ($product, $attributes, $relations): Product {
            $product->update($attributes);

            $this->syncRelations($product, $relations);

            return $product->refresh();
        });
    }

    /**
     * Soft delete. The row is kept so an accidental deletion in the admin panel
     * is recoverable, and so pivot history survives.
     */
    public function delete(Product $product): void
    {
        DB::transaction(static function () use ($product): void {
            $product->delete();
        });
    }

    public function restore(Product $product): void
    {
        $product->restore();
    }

    /**
     * @param  array<string, mixed>  $relations
     */
    private function syncRelations(Product $product, array $relations): void
    {
        if (array_key_exists('thicknesses', $relations)) {
            $product->thicknesses()->sync($this->ids($relations['thicknesses']));
        }

        if (array_key_exists('applications', $relations)) {
            $product->applications()->sync($this->ids($relations['applications']));
        }

        if (array_key_exists('gallery', $relations)) {
            $product->gallery()->sync($this->positioned($relations['gallery']));
        }

        if (array_key_exists('related', $relations)) {
            // A product related to itself would render a card linking to the
            // page it is already on.
            $related = array_values(array_diff(
                $this->ids($relations['related']),
                [(int) $product->getKey()],
            ));

            $product->relatedProducts()->sync($this->positioned($related));
        }

        if (array_key_exists('dimensions', $relations)) {
            $this->replaceDimensions($product, (array) $relations['dimensions']);
        }

        if (array_key_exists('specifications', $relations)) {
            $this->replaceSpecifications($product, (array) $relations['specifications']);
        }
    }

    /**
     * Sheet sizes are replaced wholesale rather than diffed: the admin form
     * submits the complete list, and matching rows by identity would leave
     * orphans behind whenever an editor removes one.
     *
     * @param  list<array{width_mm: int, height_mm: int, label?: string|null}>  $dimensions
     */
    private function replaceDimensions(Product $product, array $dimensions): void
    {
        $product->dimensions()->delete();

        foreach (array_values($dimensions) as $position => $dimension) {
            ProductDimension::create([
                'product_id' => $product->getKey(),
                'width_mm' => (int) $dimension['width_mm'],
                'height_mm' => (int) $dimension['height_mm'],
                'label' => $dimension['label'] ?? null,
                'position' => $position,
            ]);
        }
    }

    /**
     * @param  list<array{group?: string|null, label: array<string, string>, value: array<string, string>, unit?: string|null}>  $specifications
     */
    private function replaceSpecifications(Product $product, array $specifications): void
    {
        $product->specifications()->delete();

        foreach (array_values($specifications) as $position => $specification) {
            ProductSpecification::create([
                'product_id' => $product->getKey(),
                'group' => $specification['group'] ?? null,
                'label' => $specification['label'],
                'value' => $specification['value'],
                'unit' => $specification['unit'] ?? null,
                'position' => $position,
            ]);
        }
    }

    /**
     * @return list<int>
     */
    private function ids(mixed $values): array
    {
        return array_values(array_unique(array_map(
            'intval',
            array_filter((array) $values, static fn ($value): bool => is_numeric($value)),
        )));
    }

    /**
     * Preserves the submitted order as an explicit pivot position, so an editor
     * arranging a gallery gets the arrangement they chose.
     *
     * @return array<int, array<string, int>>
     */
    private function positioned(mixed $values): array
    {
        $payload = [];

        foreach ($this->ids($values) as $position => $id) {
            $payload[$id] = ['position' => $position];
        }

        return $payload;
    }
}
