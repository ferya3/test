<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Product;

class ProductObserver
{
    /**
     * Maintain the denormalised search column.
     *
     * Translatable text lives in JSON columns, which are not usefully indexable,
     * so every searchable string for every locale is flattened into one TEXT
     * column that carries a FULLTEXT index on MySQL. Recomputed on save rather
     * than in a queued job, because a product whose name changed must not stay
     * unfindable until a worker catches up.
     */
    public function saving(Product $product): void
    {
        if (! $this->searchableAttributesChanged($product)) {
            return;
        }

        $product->search_index = $this->buildSearchIndex($product);
    }

    private function searchableAttributesChanged(Product $product): bool
    {
        return ! $product->exists
            || $product->search_index === null
            || $product->isDirty(['name', 'short_description', 'description', 'code']);
    }

    private function buildSearchIndex(Product $product): string
    {
        $parts = [$product->code];

        foreach (['name', 'short_description', 'description'] as $attribute) {
            foreach ($product->getTranslations($attribute) as $value) {
                $parts[] = $value;
            }
        }

        $text = implode(' ', array_filter($parts));

        // Collapse whitespace so the stored value stays compact; the FULLTEXT
        // index does its own tokenising.
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }
}
