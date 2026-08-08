<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->tree() as $position => $definition) {
            $parent = $this->upsert($definition, $position, null);

            foreach ($definition['children'] ?? [] as $childPosition => $child) {
                $this->upsert($child, $childPosition, $parent);
            }
        }
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
                'slug' => 'cabinet-panels',
                'name' => ['fa' => 'پنل کابینت', 'en' => 'Cabinet Panels'],
                'short' => [
                    'fa' => 'پنل بدنه و درب کابینت آشپزخانه در ضخامت‌ها و سطوح مختلف.',
                    'en' => 'Carcass and door panels for kitchen cabinetry in a range of thicknesses and finishes.',
                ],
                'featured' => true,
                'children' => [
                    [
                        'slug' => 'high-gloss-cabinet-panels',
                        'name' => ['fa' => 'پنل های‌گلاس', 'en' => 'High Gloss Panels'],
                        'short' => [
                            'fa' => 'سطح آینه‌ای با عمق رنگ بالا برای آشپزخانه‌های مدرن.',
                            'en' => 'Mirror-finish surfaces with deep colour for contemporary kitchens.',
                        ],
                    ],
                    [
                        'slug' => 'super-matte-cabinet-panels',
                        'name' => ['fa' => 'پنل سوپرمات', 'en' => 'Super Matte Panels'],
                        'short' => [
                            'fa' => 'سطح مخملی ضد اثر انگشت.',
                            'en' => 'Velvet, anti-fingerprint surface.',
                        ],
                    ],
                    [
                        'slug' => 'membrane-cabinet-panels',
                        'name' => ['fa' => 'پنل ممبران', 'en' => 'Membrane Panels'],
                        'short' => [
                            'fa' => 'روکش وکیوم با امکان فرم‌دهی لبه.',
                            'en' => 'Vacuum-pressed foil with formable edge profiles.',
                        ],
                    ],
                ],
            ],
            [
                'slug' => 'decorative-panels',
                'name' => ['fa' => 'پنل تزئینی', 'en' => 'Decorative Panels'],
                'short' => [
                    'fa' => 'پنل‌های دیوارپوش و تزئینی برای فضاهای مسکونی و تجاری.',
                    'en' => 'Wall and decorative panels for residential and commercial interiors.',
                ],
                'featured' => true,
                'children' => [
                    [
                        'slug' => 'wall-panels',
                        'name' => ['fa' => 'دیوارپوش', 'en' => 'Wall Panels'],
                    ],
                    [
                        'slug' => 'acoustic-panels',
                        'name' => ['fa' => 'پنل آکوستیک', 'en' => 'Acoustic Panels'],
                    ],
                    [
                        'slug' => 'slatted-panels',
                        'name' => ['fa' => 'پنل شیاردار', 'en' => 'Slatted Panels'],
                    ],
                ],
            ],
            [
                'slug' => 'melamine-boards',
                'name' => ['fa' => 'ورق ملامینه', 'en' => 'Melamine Boards'],
                'short' => [
                    'fa' => 'ورق روکش‌دار ملامینه در تنوع کامل رنگ و طرح.',
                    'en' => 'Melamine-faced boards across the full colour and decor range.',
                ],
                'featured' => true,
            ],
            [
                'slug' => 'edge-banding',
                'name' => ['fa' => 'نوار لبه', 'en' => 'Edge Banding'],
                'short' => [
                    'fa' => 'نوار PVC و ABS هم‌رنگ با پنل.',
                    'en' => 'PVC and ABS banding colour-matched to the panel range.',
                ],
            ],
        ];
    }
}
