<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $seeded = [];

        foreach ($this->tree() as $position => $definition) {
            $parent = $this->upsert($definition, $position, null);
            $seeded[] = $parent->slug;

            foreach ($definition['children'] ?? [] as $childPosition => $child) {
                $seeded[] = $this->upsert($child, $childPosition, $parent)->slug;
            }
        }

        $this->retire($seeded);
    }

    /**
     * Deactivate categories the tree no longer defines, and hide the products
     * left inside them.
     *
     * Deactivating rather than deleting: a category may already be referenced
     * by an order, a printed catalogue or an inbound link, and a foreign key
     * that vanishes takes its products with it. Hidden is recoverable; deleted
     * is not.
     *
     * @param  list<string>  $keep
     */
    private function retire(array $keep): void
    {
        $stale = Category::query()->whereNotIn('slug', $keep)->get();

        if ($stale->isEmpty()) {
            return;
        }

        $ids = $stale->pluck('id')->all();

        Category::query()->whereIn('id', $ids)->update(['is_active' => false, 'is_featured' => false]);

        // Without this a product keeps pointing at a hidden category and shows
        // up on the products index with no category to filter it by.
        $hidden = Product::query()->whereIn('category_id', $ids)->update(['is_active' => false]);

        $this->command?->info(
            "Retired {$stale->count()} category(ies) no longer in the tree, hiding {$hidden} product(s).",
        );
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private function upsert(array $definition, int $position, ?Category $parent): Category
    {
        return Category::updateOrCreate(
            ['slug' => $definition['slug']],
            [
                'parent_id' => $parent?->getKey(),
                'name' => $definition['name'],
                'short_description' => $definition['short'] ?? null,
                'position' => $position,
                'is_active' => true,
                'is_featured' => $definition['featured'] ?? false,
            ],
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function tree(): array
    {
        return [
            [
                'slug' => 'hpl-cabinet-panel',
                'name' => ['fa' => 'صفحه کابینت اچ‌پی‌ال', 'en' => 'HPL Cabinet Panel'],
                'short' => [
                    'fa' => 'ورق HPL پرس‌شده روی هسته MDF، برای بدنه و درب کابینت آشپزخانه و کمد.',
                    'en' => 'HPL pressed onto an MDF core, for kitchen cabinet carcasses, doors and wardrobes.',
                ],
                'featured' => true,
            ],
            [
                'slug' => 'hpl-compact',
                'name' => ['fa' => 'کامپکت اچ‌پی‌ال', 'en' => 'HPL Compact'],
                'short' => [
                    'fa' => 'ورق فشرده یکپارچه بدون هسته چوبی؛ خودایستا و مقاوم در برابر رطوبت مستقیم.',
                    'en' => 'Solid, self-supporting compact laminate with no wood core — built for direct moisture.',
                ],
                'featured' => true,
            ],
        ];
    }
}
