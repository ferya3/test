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
        // The two groups are flat roots that hold products directly.
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
            ['hpl-cabinet-panel', 'plain-white-decor', 'high-gloss', 'mdf', 'pure-white'],
            ['hpl-cabinet-panel', 'plain-graphite-decor', 'high-gloss', 'mdf', 'graphite'],
            ['hpl-cabinet-panel', 'carrara-marble-decor', 'high-gloss', 'mdf', 'carrara'],
            ['hpl-cabinet-panel', 'calacatta-decor', 'high-gloss', 'mdf', 'carrara'],
            ['hpl-cabinet-panel', 'plain-white-decor', 'super-matte', 'mdf', 'glacier-white'],
            ['hpl-cabinet-panel', 'plain-graphite-decor', 'super-matte', 'mdf', 'matte-black'],
            ['hpl-cabinet-panel', 'linen-decor', 'super-matte', 'mdf', 'cashmere'],
            ['hpl-cabinet-panel', 'concrete-decor', 'super-matte', 'mdf', 'urban-concrete'],
            ['hpl-cabinet-panel', 'natural-oak-decor', 'embossed', 'moisture-resistant-mdf', 'natural-oak'],
            ['hpl-cabinet-panel', 'rustic-oak-decor', 'embossed', 'moisture-resistant-mdf', 'natural-oak'],
            ['hpl-cabinet-panel', 'american-walnut-decor', 'matte', 'moisture-resistant-mdf', 'smoked-walnut'],
            ['hpl-cabinet-panel', 'wenge-decor', 'matte', 'mdf', 'smoked-walnut'],

            ['hpl-compact', 'plain-white-decor', 'matte', 'compact-core', 'pure-white'],
            ['hpl-compact', 'plain-graphite-decor', 'matte', 'compact-core', 'graphite'],
            ['hpl-compact', 'plain-graphite-decor', 'super-matte', 'compact-core', 'matte-black'],
            ['hpl-compact', 'natural-oak-decor', 'matte', 'compact-core', 'natural-oak'],
            ['hpl-compact', 'american-walnut-decor', 'semi-matte', 'compact-core', 'smoked-walnut'],
            ['hpl-compact', 'concrete-decor', 'matte', 'compact-core', 'urban-concrete'],
            ['hpl-compact', 'terrazzo-decor', 'semi-matte', 'compact-core', 'nordic-grey'],
            ['hpl-compact', 'carrara-marble-decor', 'semi-matte', 'compact-core', 'carrara'],
            ['hpl-compact', 'linen-decor', 'matte', 'compact-core', 'cashmere'],
            ['hpl-compact', 'linen-decor', 'super-matte', 'compact-core', 'deep-green'],
        ];

        $labels = $this->decorLabels();
        $surfaceLabels = $this->surfaceLabels();

        foreach ($combinations as $index => [$category, $decor, $surface, $material, $color]) {
            [$decorFa, $decorEn] = $labels[$decor];
            [$surfaceFa, $surfaceEn] = $surfaceLabels[$surface];

            $isCompact = $category === 'hpl-compact';

            // The same decor/surface pair is sold into both groups, so the
            // category token is what makes the SKU — and therefore the slug —
            // unique.
            $decorSegment = (string) preg_replace('/-decor$/', '', $decor);

            $productFa = $isCompact ? 'ورق کامپکت' : 'صفحه کابینت';
            $productEn = $isCompact ? 'Compact Sheet' : 'Cabinet Panel';

            $rows[] = [
                'slug' => "{$decorSegment}-{$surface}-{$this->categoryToken($category)}",
                'category' => $category,
                'decor' => $decor,
                'surface' => $surface,
                'material' => $material,
                'color' => $color,
                // Three from each group, so the homepage strip shows the range
                // rather than twelve variations of a cabinet door.
                'featured' => $index < 3 || ($index >= 12 && $index < 15),
                'name' => [
                    'fa' => "{$productFa} {$surfaceFa} {$decorFa}",
                    'en' => "{$decorEn} {$surfaceEn} {$productEn}",
                ],
                'short' => $isCompact
                    ? [
                        'fa' => "ورق کامپکت یکپارچه {$surfaceFa} با طرح {$decorFa}؛ خودایستا و مقاوم در برابر آب.",
                        'en' => "Solid {$surfaceEn} compact sheet in {$decorEn} decor — self-supporting and waterproof.",
                    ]
                    : [
                        'fa' => "صفحه کابینت {$surfaceFa} با روکش HPL طرح {$decorFa} روی هسته MDF.",
                        'en' => "{$surfaceEn} cabinet panel faced in {$decorEn} HPL over an MDF core.",
                    ],
                'description' => $isCompact
                    ? [
                        'fa' => "ورق کامپکت اچ‌پی‌ال با روکش {$decorFa} و سطح {$surfaceFa}. لایه‌های کاغذ کرافت آغشته به رزین فنولیک زیر فشار و حرارت بالا به یک ورق یکپارچه تبدیل می‌شوند؛ چون هسته چوبی وجود ندارد، ورق در تماس مستقیم با آب باد نمی‌کند و نیازی به قاب یا زیرسازی ندارد. لبه‌ها پس از برش قابل پولیش‌اند و همان هسته تیره را نشان می‌دهند.",
                        'en' => "HPL compact sheet with a {$decorEn} facing and a {$surfaceEn} surface. Kraft layers impregnated with phenolic resin are pressed under heat into a single solid board; with no wood core there is nothing to swell in direct contact with water, and the sheet needs no frame or substrate behind it. Cut edges polish up to show the same dark core.",
                    ]
                    : [
                        'fa' => "صفحه کابینت با روکش اچ‌پی‌ال {$decorFa} و سطح {$surfaceFa} روی هسته MDF. پرس گرم و چسب مقاوم به رطوبت، پایداری ابعادی و دوام سطح را تضمین می‌کند. ابعاد دقیق و لبه‌های صاف، برش و نوارکاری را در کارگاه ساده می‌کند و تمام مراحل تولید تحت کنترل آزمایشگاه کیفیت کارخانه انجام می‌شود.",
                        'en' => "Cabinet panel with a {$decorEn} HPL facing and a {$surfaceEn} surface over an MDF core. Hot pressing with moisture-resistant adhesive delivers dimensional stability and surface durability. Precise sizing and clean edges simplify cutting and edge-banding, and every stage is verified by the factory's quality laboratory.",
                    ],
                'thicknesses' => $this->thicknessesFor($category),
                'applications' => $this->applicationsFor($category),
                // Compact is pressed on a larger press bed and sold in the
                // sheet sizes that suit partitions and worktops.
                'sizes' => $isCompact
                    ? [[3050, 1300], [2440, 1220]]
                    : [[2800, 1220], [2440, 1220]],
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
            'hpl-cabinet-panel' => 'cabinet',
            'hpl-compact' => 'compact',
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
            // Compact is the finished board, so its thicknesses are the sheet
            // itself; a cabinet panel's are the core it is pressed onto.
            'hpl-compact' => ['6', '8', '10', '12'],
            default => ['16', '18', '22'],
        };
    }

    /**
     * @return list<string>
     */
    private function applicationsFor(string $categorySlug): array
    {
        return match ($categorySlug) {
            'hpl-compact' => ['wet-area', 'sanitary-partition', 'laboratory-worktop', 'commercial-fit-out', 'wall-panel'],
            default => ['kitchen-cabinet', 'wardrobe', 'door-panel'],
        };
    }
}
