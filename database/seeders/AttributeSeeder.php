<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Application;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Surface;
use App\Models\Thickness;
use App\Support\Enums\ColorFamily;
use App\Support\Enums\DecorFamily;
use Illuminate\Database\Seeder;

/**
 * Curated (not randomised) catalogue attributes: these are the real filter
 * facets a panel factory sells against, with stable slugs so URLs survive
 * a re-seed.
 */
class AttributeSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedMaterials();
        $this->seedSurfaces();
        $this->seedApplications();
        $this->seedThicknesses();
        $this->seedColors();
        $this->seedDecors();
    }

    private function seedMaterials(): void
    {
        $materials = [
            ['mdf', 'ام‌دی‌اف', 'MDF', 'تخته فیبر با چگالی متوسط، پایه اصلی پنل‌های کابینت.', 'Medium-density fibreboard, the core substrate for cabinet panels.'],
            ['hdf', 'اچ‌دی‌اف', 'HDF', 'تخته فیبر با چگالی بالا برای کاربردهای نازک و مقاوم.', 'High-density fibreboard for thin, high-strength applications.'],
            ['moisture-resistant-mdf', 'ام‌دی‌اف ضد رطوبت', 'Moisture-Resistant MDF', 'مناسب محیط‌های مرطوب مانند زیر سینک ظرفشویی.', 'Suited to damp environments such as under-sink cabinetry.'],
            ['particleboard', 'نئوپان', 'Particleboard', 'گزینه اقتصادی برای بدنه کابینت و کمد.', 'An economical option for cabinet and wardrobe carcasses.'],
            ['plywood', 'تخته چندلایه', 'Plywood', 'مقاومت مکانیکی بالا و پایداری ابعادی.', 'High mechanical strength and dimensional stability.'],
            ['compact-core', 'هسته کامپکت', 'Compact Core', 'لایه‌های کاغذ کرافت آغشته به رزین فنولیک که زیر فشار و حرارت بالا به یک ورق یکپارچه تبدیل می‌شوند؛ بدون هسته چوبی.', 'Kraft layers impregnated with phenolic resin and pressed under heat into one solid sheet, with no wood core at all.'],
        ];

        foreach ($materials as $position => [$slug, $nameFa, $nameEn, $descFa, $descEn]) {
            Material::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'description' => ['fa' => $descFa, 'en' => $descEn],
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }
    }

    private function seedSurfaces(): void
    {
        $surfaces = [
            ['high-gloss', 'های‌گلاس', 'High Gloss', 92, 'سطح آینه‌ای با درخشش بالا.', 'Mirror-finish surface with a high shine.'],
            ['super-matte', 'سوپرمات', 'Super Matte', 3, 'سطح مات مخملی و ضد اثر انگشت.', 'Velvet matte, anti-fingerprint surface.'],
            ['matte', 'مات', 'Matte', 8, 'سطح مات یکنواخت و بدون بازتاب.', 'Even, non-reflective matte surface.'],
            ['semi-matte', 'نیمه‌مات', 'Semi Matte', 35, 'تعادل میان مات و براق.', 'A balance between matte and gloss.'],
            ['embossed', 'طرح‌دار', 'Embossed', 15, 'بافت برجسته هم‌راستا با رگه چوب.', 'Raised texture synchronised with the wood grain.'],
        ];

        foreach ($surfaces as $position => [$slug, $nameFa, $nameEn, $gloss, $descFa, $descEn]) {
            Surface::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'description' => ['fa' => $descFa, 'en' => $descEn],
                    'gloss_level' => $gloss,
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }
    }

    private function seedApplications(): void
    {
        $applications = [
            ['kitchen-cabinet', 'کابینت آشپزخانه', 'Kitchen Cabinet'],
            ['wardrobe', 'کمد دیواری', 'Wardrobe'],
            ['wall-panel', 'دیوارپوش', 'Wall Panel'],
            ['office-furniture', 'مبلمان اداری', 'Office Furniture'],
            ['commercial-fit-out', 'فضای تجاری', 'Commercial Fit-Out'],
            ['door-panel', 'درب و رودری', 'Door Panel'],
            ['wet-area', 'فضای مرطوب', 'Wet Area'],
            ['sanitary-partition', 'پارتیشن سرویس بهداشتی', 'Sanitary Partition'],
            ['laboratory-worktop', 'میز آزمایشگاه', 'Laboratory Worktop'],
        ];

        foreach ($applications as $position => [$slug, $nameFa, $nameEn]) {
            Application::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }
    }

    private function seedThicknesses(): void
    {
        foreach ([2.5, 3, 6, 8, 10, 12, 16, 18, 22, 25] as $position => $value) {
            Thickness::updateOrCreate(
                ['value_mm' => $value],
                ['position' => $position, 'is_active' => true],
            );
        }
    }

    private function seedColors(): void
    {
        $colors = [
            ['glacier-white', 'سفید یخی', 'Glacier White', '#F4F5F3', ColorFamily::Neutral],
            ['pure-white', 'سفید مطلق', 'Pure White', '#FFFFFF', ColorFamily::Neutral],
            ['nordic-grey', 'طوسی نوردیک', 'Nordic Grey', '#9BA0A3', ColorFamily::Neutral],
            ['graphite', 'گرافیتی', 'Graphite', '#3A3D40', ColorFamily::Neutral],
            ['matte-black', 'مشکی مات', 'Matte Black', '#1A1B1C', ColorFamily::Solid],
            ['cashmere', 'کشمیر', 'Cashmere', '#D8CFC2', ColorFamily::Neutral],
            ['natural-oak', 'بلوط طبیعی', 'Natural Oak', '#C49A6C', ColorFamily::Wood],
            ['smoked-walnut', 'گردو دودی', 'Smoked Walnut', '#6B4A33', ColorFamily::Wood],
            ['carrara', 'مرمر کارارا', 'Carrara Marble', '#EDEDE8', ColorFamily::Stone],
            ['urban-concrete', 'بتن شهری', 'Urban Concrete', '#A5A29C', ColorFamily::Stone],
            ['champagne', 'شامپاینی', 'Champagne', '#C9B79C', ColorFamily::Metallic],
            ['deep-green', 'سبز عمیق', 'Deep Green', '#2F4438', ColorFamily::Solid],
        ];

        foreach ($colors as $position => [$slug, $nameFa, $nameEn, $hex, $family]) {
            Color::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'hex' => $hex,
                    'color_family' => $family,
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }
    }

    private function seedDecors(): void
    {
        $decors = [
            ['natural-oak-decor', 'D-1001', 'بلوط طبیعی', 'Natural Oak', DecorFamily::Wood],
            ['rustic-oak-decor', 'D-1002', 'بلوط روستیک', 'Rustic Oak', DecorFamily::Wood],
            ['american-walnut-decor', 'D-1003', 'گردو آمریکایی', 'American Walnut', DecorFamily::Wood],
            ['zebrano-decor', 'D-1004', 'زبرانو', 'Zebrano', DecorFamily::Wood],
            ['wenge-decor', 'D-1005', 'ونگه', 'Wenge', DecorFamily::Wood],
            ['carrara-marble-decor', 'D-2001', 'مرمر کارارا', 'Carrara Marble', DecorFamily::Stone],
            ['calacatta-decor', 'D-2002', 'کالاکاتا', 'Calacatta', DecorFamily::Stone],
            ['concrete-decor', 'D-2003', 'بتن اکسپوز', 'Exposed Concrete', DecorFamily::Stone],
            ['linen-decor', 'D-3001', 'کتان', 'Linen', DecorFamily::Fabric],
            ['plain-white-decor', 'D-4001', 'سفید ساده', 'Plain White', DecorFamily::Solid],
            ['plain-graphite-decor', 'D-4002', 'گرافیتی ساده', 'Plain Graphite', DecorFamily::Solid],
            ['terrazzo-decor', 'D-5001', 'تراتزو', 'Terrazzo', DecorFamily::Fantasy],
        ];

        foreach ($decors as $position => [$slug, $code, $nameFa, $nameEn, $family]) {
            Decor::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'code' => $code,
                    'decor_family' => $family,
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }
    }
}
