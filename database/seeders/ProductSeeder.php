<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Application;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\ProductDimension;
use App\Models\ProductSpecification;
use App\Models\Surface;
use App\Models\Thickness;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

/**
 * Builds a catalogue by combining the seeded attributes the way a real product
 * range is built: each decor is offered in a small set of surfaces, and each
 * combination becomes one SKU.
 */
class ProductSeeder extends Seeder
{
    public function run(): void
    {
        // Includes root categories: "melamine-boards" has no children and holds
        // products directly.
        $categories = Category::query()->get()->keyBy('slug');
        $decors = Decor::query()->get()->keyBy('slug');
        $colors = Color::query()->get()->keyBy('slug');
        $surfaces = Surface::query()->get()->keyBy('slug');
        $materials = Material::query()->get()->keyBy('slug');
        $thicknesses = Thickness::query()->get()->keyBy(fn (Thickness $t): string => $t->trimmedValue());
        $applications = Application::query()->get()->keyBy('slug');

        if ($categories->isEmpty() || $decors->isEmpty()) {
            return;
        }

        $sequence = 1000;

        foreach ($this->range() as $definition) {
            $category = $categories->get($definition['category']);
            $decor = $decors->get($definition['decor']);
            $surface = $surfaces->get($definition['surface']);
            $material = $materials->get($definition['material']);
            $color = $colors->get($definition['color']);

            if ($category === null || $decor === null || $surface === null) {
                continue;
            }

            $sequence++;
            $code = 'PNL-'.$sequence;

            $product = Product::updateOrCreate(
                ['code' => $code],
                [
                    'slug' => $definition['slug'],
                    'category_id' => $category->getKey(),
                    'material_id' => $material?->getKey(),
                    'surface_id' => $surface->getKey(),
                    'decor_id' => $decor->getKey(),
                    'color_id' => $color?->getKey(),
                    'name' => [
                        'fa' => $definition['name']['fa'],
                        'en' => $definition['name']['en'],
                    ],
                    'short_description' => [
                        'fa' => $definition['short']['fa'],
                        'en' => $definition['short']['en'],
                    ],
                    'description' => [
                        'fa' => $definition['description']['fa'],
                        'en' => $definition['description']['en'],
                    ],
                    'is_active' => true,
                    'is_featured' => $definition['featured'] ?? false,
                    'position' => $sequence - 1000,
                    'published_at' => now()->subDays(($sequence - 1000) * 3),
                ],
            );

            $this->syncThicknesses($product, $thicknesses, $definition['thicknesses']);
            $this->syncApplications($product, $applications, $definition['applications']);
            $this->syncDimensions($product, $definition['sizes']);
            $this->syncSpecifications($product, $surface->gloss_level);
        }

        $this->linkRelatedProducts();
    }

    /**
     * @param  Collection<string, Thickness>  $available
     * @param  list<string>  $wanted
     */
    private function syncThicknesses(Product $product, Collection $available, array $wanted): void
    {
        $product->thicknesses()->sync($this->resolveIds($available, $wanted));
    }

    /**
     * @param  Collection<string, Application>  $available
     * @param  list<string>  $wanted
     */
    private function syncApplications(Product $product, Collection $available, array $wanted): void
    {
        $product->applications()->sync($this->resolveIds($available, $wanted));
    }

    /**
     * Map lookup keys to primary keys.
     *
     * Deliberately not Collection::only(): on an Eloquent collection that
     * selects by model *id*, not by array key, and would silently match nothing.
     *
     * @param  Collection<string, covariant \Illuminate\Database\Eloquent\Model>  $available
     * @param  list<string>  $wanted
     * @return list<int>
     */
    private function resolveIds(Collection $available, array $wanted): array
    {
        $ids = [];

        foreach ($wanted as $key) {
            $model = $available->get($key);

            if ($model !== null) {
                $ids[] = (int) $model->getKey();
            }
        }

        return $ids;
    }

    /**
     * @param  list<array{0: int, 1: int}>  $sizes
     */
    private function syncDimensions(Product $product, array $sizes): void
    {
        foreach ($sizes as $position => [$width, $height]) {
            ProductDimension::updateOrCreate(
                [
                    'product_id' => $product->getKey(),
                    'width_mm' => $width,
                    'height_mm' => $height,
                ],
                ['position' => $position],
            );
        }
    }

    private function syncSpecifications(Product $product, ?int $glossLevel): void
    {
        $specifications = [
            ['physical', 'چگالی', 'Density', '۷۴۰', '740', 'kg/m³'],
            ['physical', 'مقاومت خمشی', 'Bending Strength', '۲۳', '23', 'N/mm²'],
            ['physical', 'جذب آب پس از ۲۴ ساعت', 'Water Absorption (24h)', 'کمتر از ۸', 'Below 8', '%'],
            ['surface', 'مقاومت به خط و خش', 'Scratch Resistance', 'درجه ۴', 'Grade 4', null],
            ['surface', 'مقاومت به حرارت', 'Heat Resistance', 'تا ۱۸۰ درجه', 'Up to 180 °C', null],
            ['compliance', 'رهایش فرمالدهید', 'Formaldehyde Emission', 'کلاس E1', 'Class E1', null],
            ['compliance', 'استاندارد مرجع', 'Reference Standard', 'EN 14322', 'EN 14322', null],
        ];

        if ($glossLevel !== null) {
            $specifications[] = ['surface', 'براقیت سطح', 'Surface Gloss', (string) $glossLevel, (string) $glossLevel, 'GU'];
        }

        foreach ($specifications as $position => [$group, $labelFa, $labelEn, $valueFa, $valueEn, $unit]) {
            ProductSpecification::updateOrCreate(
                [
                    'product_id' => $product->getKey(),
                    'group' => $group,
                    'label' => ['fa' => $labelFa, 'en' => $labelEn],
                ],
                [
                    'value' => ['fa' => $valueFa, 'en' => $valueEn],
                    'unit' => $unit,
                    'position' => $position,
                ],
            );
        }
    }

    /**
     * Relate each product to others sharing its category, which is what an
     * editor would curate by hand.
     */
    private function linkRelatedProducts(): void
    {
        Product::query()
            ->select(['id', 'category_id'])
            ->get()
            ->groupBy('category_id')
            ->each(function (Collection $siblings): void {
                foreach ($siblings as $product) {
                    $related = $siblings
                        ->where('id', '!=', $product->id)
                        ->take(4)
                        ->values();

                    $payload = [];

                    foreach ($related as $position => $sibling) {
                        $payload[$sibling->id] = ['position' => $position];
                    }

                    $product->relatedProducts()->sync($payload);
                }
            });
    }

    /**
     * The product range: decor × surface combinations per category.
     *
     * @return list<array<string, mixed>>
     */
    private function range(): array
    {
        $rows = [];

        $combinations = [
            // category slug, decor slug, surface slug, material slug, color slug
            ['high-gloss-cabinet-panels', 'plain-white-decor', 'high-gloss', 'mdf', 'pure-white'],
            ['high-gloss-cabinet-panels', 'plain-graphite-decor', 'high-gloss', 'mdf', 'graphite'],
            ['high-gloss-cabinet-panels', 'carrara-marble-decor', 'high-gloss', 'mdf', 'carrara'],
            ['high-gloss-cabinet-panels', 'calacatta-decor', 'high-gloss', 'mdf', 'carrara'],
            ['super-matte-cabinet-panels', 'plain-white-decor', 'super-matte', 'mdf', 'glacier-white'],
            ['super-matte-cabinet-panels', 'plain-graphite-decor', 'super-matte', 'mdf', 'matte-black'],
            ['super-matte-cabinet-panels', 'linen-decor', 'super-matte', 'mdf', 'cashmere'],
            ['super-matte-cabinet-panels', 'concrete-decor', 'super-matte', 'mdf', 'urban-concrete'],
            ['membrane-cabinet-panels', 'natural-oak-decor', 'embossed', 'moisture-resistant-mdf', 'natural-oak'],
            ['membrane-cabinet-panels', 'rustic-oak-decor', 'embossed', 'moisture-resistant-mdf', 'natural-oak'],
            ['membrane-cabinet-panels', 'american-walnut-decor', 'matte', 'moisture-resistant-mdf', 'smoked-walnut'],
            ['membrane-cabinet-panels', 'wenge-decor', 'matte', 'mdf', 'smoked-walnut'],
            ['melamine-boards', 'natural-oak-decor', 'matte', 'particleboard', 'natural-oak'],
            ['melamine-boards', 'zebrano-decor', 'embossed', 'particleboard', 'smoked-walnut'],
            ['melamine-boards', 'plain-white-decor', 'matte', 'particleboard', 'pure-white'],
            ['melamine-boards', 'terrazzo-decor', 'semi-matte', 'particleboard', 'nordic-grey'],
            ['wall-panels', 'concrete-decor', 'matte', 'hdf', 'urban-concrete'],
            ['wall-panels', 'american-walnut-decor', 'semi-matte', 'hdf', 'smoked-walnut'],
            ['wall-panels', 'linen-decor', 'matte', 'hdf', 'cashmere'],
            ['acoustic-panels', 'natural-oak-decor', 'matte', 'mdf', 'natural-oak'],
            ['acoustic-panels', 'wenge-decor', 'matte', 'mdf', 'smoked-walnut'],
            ['slatted-panels', 'rustic-oak-decor', 'embossed', 'mdf', 'natural-oak'],
            ['slatted-panels', 'plain-graphite-decor', 'super-matte', 'mdf', 'graphite'],
            ['slatted-panels', 'linen-decor', 'super-matte', 'mdf', 'deep-green'],
        ];

        $labels = $this->decorLabels();
        $surfaceLabels = $this->surfaceLabels();

        foreach ($combinations as $index => [$category, $decor, $surface, $material, $color]) {
            [$decorFa, $decorEn] = $labels[$decor];
            [$surfaceFa, $surfaceEn] = $surfaceLabels[$surface];

            // The same decor/surface pair is genuinely sold into several
            // categories, so the category token is what makes the SKU — and
            // therefore the slug — unique.
            $decorSegment = (string) preg_replace('/-decor$/', '', $decor);

            $rows[] = [
                'slug' => "{$decorSegment}-{$surface}-{$this->categoryToken($category)}",
                'category' => $category,
                'decor' => $decor,
                'surface' => $surface,
                'material' => $material,
                'color' => $color,
                'featured' => $index < 6,
                'name' => [
                    'fa' => "پنل {$surfaceFa} {$decorFa}",
                    'en' => "{$decorEn} {$surfaceEn} Panel",
                ],
                'short' => [
                    'fa' => "پنل {$surfaceFa} با طرح {$decorFa}، مناسب کابینت و دکوراسیون داخلی.",
                    'en' => "{$surfaceEn} panel in {$decorEn} decor for cabinetry and interior joinery.",
                ],
                'description' => [
                    'fa' => "این پنل با روکش {$decorFa} و سطح {$surfaceFa} تولید می‌شود. پرس گرم و چسب مقاوم به رطوبت، پایداری ابعادی و دوام سطح را تضمین می‌کند. ابعاد دقیق و لبه‌های صاف، برش و مونتاژ را در کارگاه ساده می‌کند و تمام مراحل تولید تحت کنترل آزمایشگاه کیفیت کارخانه انجام می‌شود.",
                    'en' => "Produced with a {$decorEn} facing and a {$surfaceEn} surface. Hot pressing with moisture-resistant adhesive delivers dimensional stability and surface durability. Precise sizing and clean edges simplify cutting and assembly, and every stage is verified by the factory's quality laboratory.",
                ],
                'thicknesses' => $this->thicknessesFor($category),
                'applications' => $this->applicationsFor($category),
                'sizes' => [[2800, 1220], [2440, 1220]],
            ];
        }

        return $rows;
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    private function decorLabels(): array
    {
        return [
            'natural-oak-decor' => ['بلوط طبیعی', 'Natural Oak'],
            'rustic-oak-decor' => ['بلوط روستیک', 'Rustic Oak'],
            'american-walnut-decor' => ['گردو آمریکایی', 'American Walnut'],
            'zebrano-decor' => ['زبرانو', 'Zebrano'],
            'wenge-decor' => ['ونگه', 'Wenge'],
            'carrara-marble-decor' => ['مرمر کارارا', 'Carrara Marble'],
            'calacatta-decor' => ['کالاکاتا', 'Calacatta'],
            'concrete-decor' => ['بتن اکسپوز', 'Exposed Concrete'],
            'linen-decor' => ['کتان', 'Linen'],
            'plain-white-decor' => ['سفید ساده', 'Plain White'],
            'plain-graphite-decor' => ['گرافیتی ساده', 'Plain Graphite'],
            'terrazzo-decor' => ['تراتزو', 'Terrazzo'],
        ];
    }

    /**
     * A short, URL-friendly token per category, used to keep SKU slugs unique.
     */
    private function categoryToken(string $categorySlug): string
    {
        return match ($categorySlug) {
            'high-gloss-cabinet-panels',
            'super-matte-cabinet-panels',
            'membrane-cabinet-panels' => 'cabinet',
            'melamine-boards' => 'melamine',
            'wall-panels' => 'wall',
            'acoustic-panels' => 'acoustic',
            'slatted-panels' => 'slatted',
            default => $categorySlug,
        };
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    private function surfaceLabels(): array
    {
        return [
            'high-gloss' => ['های‌گلاس', 'High Gloss'],
            'super-matte' => ['سوپرمات', 'Super Matte'],
            'matte' => ['مات', 'Matte'],
            'semi-matte' => ['نیمه‌مات', 'Semi Matte'],
            'embossed' => ['طرح‌دار', 'Embossed'],
        ];
    }

    /**
     * @return list<string>
     */
    private function thicknessesFor(string $categorySlug): array
    {
        return match ($categorySlug) {
            'wall-panels', 'acoustic-panels' => ['8', '10', '12'],
            'slatted-panels' => ['12', '16', '18'],
            default => ['16', '18', '22'],
        };
    }

    /**
     * @return list<string>
     */
    private function applicationsFor(string $categorySlug): array
    {
        return match ($categorySlug) {
            'wall-panels', 'acoustic-panels', 'slatted-panels' => ['wall-panel', 'commercial-fit-out', 'office-furniture'],
            'melamine-boards' => ['kitchen-cabinet', 'wardrobe', 'office-furniture'],
            default => ['kitchen-cabinet', 'wardrobe', 'door-panel'],
        };
    }
}
