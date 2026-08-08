<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Catalog;
use App\Models\Certificate;
use App\Models\Product;
use App\Models\Project;
use App\Support\Enums\ProjectType;
use Illuminate\Database\Seeder;

/**
 * Projects, certificates and catalogues — the trust-building content.
 */
class ShowcaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedProjects();
        $this->seedCertificates();
        $this->seedCatalogs();
    }

    private function seedProjects(): void
    {
        $products = Product::query()->pluck('id');

        foreach ($this->projects() as $position => $definition) {
            $project = Project::updateOrCreate(
                ['slug' => $definition['slug']],
                [
                    'title' => $definition['title'],
                    'client' => $definition['client'],
                    'location' => $definition['location'],
                    'summary' => $definition['summary'],
                    'body' => $definition['body'],
                    'year' => $definition['year'],
                    'area_sqm' => $definition['area_sqm'],
                    'project_type' => $definition['type'],
                    'completed_at' => "{$definition['year']}-09-01",
                    'is_active' => true,
                    'is_featured' => $position < 3,
                    'position' => $position,
                ],
            );

            // Link a rotating slice of the catalogue so the case study and the
            // product pages cross-reference each other.
            if ($products->isNotEmpty()) {
                $project->products()->sync(
                    $products->slice($position * 2, 3)->values()->all(),
                );
            }
        }
    }

    private function seedCertificates(): void
    {
        $certificates = [
            [
                'iso-9001',
                ['fa' => 'ایزو ۹۰۰۱:۲۰۱۵', 'en' => 'ISO 9001:2015'],
                ['fa' => 'سیستم مدیریت کیفیت', 'en' => 'Quality Management System'],
                'QMS-2024-1187',
                '2024-03-11',
                '2027-03-10',
            ],
            [
                'iso-14001',
                ['fa' => 'ایزو ۱۴۰۰۱:۲۰۱۵', 'en' => 'ISO 14001:2015'],
                ['fa' => 'سیستم مدیریت زیست‌محیطی', 'en' => 'Environmental Management System'],
                'EMS-2024-0442',
                '2024-05-02',
                '2027-05-01',
            ],
            [
                'e1-formaldehyde',
                ['fa' => 'گواهی کلاس E1 فرمالدهید', 'en' => 'E1 Formaldehyde Class Certificate'],
                ['fa' => 'آزمایشگاه مرجع مواد ساختمانی', 'en' => 'Reference Building Materials Laboratory'],
                'E1-2025-0079',
                '2025-01-20',
                '2028-01-19',
            ],
            [
                'inso-national-standard',
                ['fa' => 'استاندارد ملی ایران', 'en' => 'Iranian National Standard'],
                ['fa' => 'سازمان ملی استاندارد ایران', 'en' => 'Iranian National Standards Organization'],
                'INSO-9044-2024',
                '2024-08-14',
                null,
            ],
        ];

        foreach ($certificates as $position => [$slug, $title, $issuer, $number, $issuedAt, $expiresAt]) {
            Certificate::updateOrCreate(
                ['slug' => $slug],
                [
                    'title' => $title,
                    'issuer' => $issuer,
                    'description' => [
                        'fa' => 'این گواهی‌نامه توسط نهاد صادرکننده بررسی و تأیید شده است و نسخه اسکن آن قابل دریافت است.',
                        'en' => 'Audited and issued by the certifying body; a scanned copy is available on request.',
                    ],
                    'certificate_number' => $number,
                    'issued_at' => $issuedAt,
                    'expires_at' => $expiresAt,
                    'is_active' => true,
                    'position' => $position,
                ],
            );
        }
    }

    private function seedCatalogs(): void
    {
        $catalogs = [
            [
                'general-product-catalog-2026',
                ['fa' => 'کاتالوگ عمومی محصولات ۱۴۰۵', 'en' => 'General Product Catalogue 2026'],
                ['fa' => 'معرفی کامل گروه‌های محصول، ضخامت‌ها و ابعاد استاندارد.', 'en' => 'The complete product groups, thicknesses and standard sheet sizes.'],
                '2026.1',
                true,
            ],
            [
                'color-and-decor-chart-2026',
                ['fa' => 'شیت رنگ و طرح ۱۴۰۵', 'en' => 'Colour & Decor Chart 2026'],
                ['fa' => 'تمام کدهای رنگ و طرح با تصویر نمونه سطح.', 'en' => 'Every colour and decor code with a surface sample image.'],
                '2026.1',
                true,
            ],
            [
                'technical-datasheet-pack',
                ['fa' => 'بسته دیتاشیت فنی', 'en' => 'Technical Datasheet Pack'],
                ['fa' => 'مشخصات فنی، نتایج آزمون و راهنمای نصب.', 'en' => 'Technical specifications, test results and installation guidance.'],
                '3.0',
                false,
            ],
        ];

        foreach ($catalogs as $position => [$slug, $title, $description, $version, $gated]) {
            Catalog::updateOrCreate(
                ['slug' => $slug],
                [
                    'title' => $title,
                    'description' => $description,
                    'version' => $version,
                    'published_at' => now()->subMonths($position + 1),
                    'requires_registration' => $gated,
                    'is_active' => true,
                    'position' => $position,
                ],
            );
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function projects(): array
    {
        return [
            [
                'slug' => 'tehran-residential-tower',
                'year' => 2025,
                'area_sqm' => 18_400,
                'type' => ProjectType::Residential,
                'title' => ['fa' => 'برج مسکونی الوند، تهران', 'en' => 'Alvand Residential Tower, Tehran'],
                'client' => ['fa' => 'گروه ساختمانی الوند', 'en' => 'Alvand Construction Group'],
                'location' => ['fa' => 'تهران', 'en' => 'Tehran'],
                'summary' => [
                    'fa' => 'تأمین پنل کابینت و کمد دیواری برای ۲۴۰ واحد مسکونی.',
                    'en' => 'Cabinet and wardrobe panel supply for 240 residential units.',
                ],
                'body' => [
                    'fa' => 'برای این پروژه، تطابق رنگ بین بچ‌های تولید حساس‌ترین نکته بود، چون واحدها در چند مرحله تحویل می‌شدند. تمام سفارش از یک بچ رنگ رزرو و در انبار پروژه نگهداری شد تا اختلاف رنگ بین طبقات به وجود نیاید.',
                    'en' => 'Batch-to-batch colour match was the critical constraint here, because units were handed over in phases. The whole order was reserved from a single colour batch and held in the project warehouse so no variation appeared between floors.',
                ],
            ],
            [
                'slug' => 'isfahan-office-complex',
                'year' => 2024,
                'area_sqm' => 9_600,
                'type' => ProjectType::Office,
                'title' => ['fa' => 'مجتمع اداری نقش جهان، اصفهان', 'en' => 'Naghsh-e Jahan Office Complex, Isfahan'],
                'client' => ['fa' => 'شرکت توسعه ساختمان نقش جهان', 'en' => 'Naghsh-e Jahan Development'],
                'location' => ['fa' => 'اصفهان', 'en' => 'Isfahan'],
                'summary' => [
                    'fa' => 'دیوارپوش آکوستیک و مبلمان اداری برای ۱۲ طبقه.',
                    'en' => 'Acoustic wall panelling and office furniture across 12 floors.',
                ],
                'body' => [
                    'fa' => 'اتاق‌های جلسه به کاهش بازتاب صدا نیاز داشتند. پنل آکوستیک شیاردار با طرح بلوط طبیعی انتخاب شد تا هم عملکرد صوتی تأمین شود و هم زبان طراحی گرم بماند.',
                    'en' => 'The meeting rooms needed reverberation control. Slatted acoustic panels in natural oak were specified so the acoustic requirement was met while the design language stayed warm.',
                ],
            ],
            [
                'slug' => 'mashhad-hotel-refurbishment',
                'year' => 2024,
                'area_sqm' => 6_200,
                'type' => ProjectType::Hospitality,
                'title' => ['fa' => 'بازسازی هتل رضوان، مشهد', 'en' => 'Rezvan Hotel Refurbishment, Mashhad'],
                'client' => ['fa' => 'هتل رضوان', 'en' => 'Rezvan Hotel'],
                'location' => ['fa' => 'مشهد', 'en' => 'Mashhad'],
                'summary' => [
                    'fa' => 'پنل تزئینی لابی و کابینت ۱۸۰ اتاق.',
                    'en' => 'Lobby decorative panelling and cabinetry for 180 rooms.',
                ],
                'body' => [
                    'fa' => 'بازسازی در حالی انجام شد که هتل نیمه‌فعال بود، بنابراین ورق‌ها بر اساس برنامه طبقه‌به‌طبقه و در بسته‌های شماره‌گذاری‌شده تحویل شد تا انبارش در محل به حداقل برسد.',
                    'en' => 'The refurbishment ran while the hotel stayed partly open, so sheets were delivered floor by floor in numbered packs to keep on-site storage to a minimum.',
                ],
            ],
            [
                'slug' => 'shiraz-retail-fitout',
                'year' => 2023,
                'area_sqm' => 3_100,
                'type' => ProjectType::Commercial,
                'title' => ['fa' => 'فروشگاه زنجیره‌ای پارس، شیراز', 'en' => 'Pars Retail Chain, Shiraz'],
                'client' => ['fa' => 'خرده‌فروشی پارس', 'en' => 'Pars Retail'],
                'location' => ['fa' => 'شیراز', 'en' => 'Shiraz'],
                'summary' => [
                    'fa' => 'قفسه‌بندی و دیوارپوش شش شعبه.',
                    'en' => 'Shelving and wall panelling across six branches.',
                ],
                'body' => [
                    'fa' => 'یکنواختی بین شعبه‌ها معیار اصلی بود. یک شیت رنگ مرجع تعیین شد و تمام شعبه‌ها بر اساس همان مرجع تأمین شدند.',
                    'en' => 'Consistency between branches was the governing requirement. A single reference colour sheet was agreed and every branch was supplied against it.',
                ],
            ],
            [
                'slug' => 'tabriz-residential-phase-two',
                'year' => 2023,
                'area_sqm' => 12_800,
                'type' => ProjectType::Residential,
                'title' => ['fa' => 'مجتمع مسکونی ارک، فاز دو، تبریز', 'en' => 'Arg Residential Complex Phase Two, Tabriz'],
                'client' => ['fa' => 'تعاونی مسکن ارک', 'en' => 'Arg Housing Cooperative'],
                'location' => ['fa' => 'تبریز', 'en' => 'Tabriz'],
                'summary' => [
                    'fa' => 'پنل کابینت ضد رطوبت برای ۱۶۰ واحد.',
                    'en' => 'Moisture-resistant cabinet panels for 160 units.',
                ],
                'body' => [
                    'fa' => 'به دلیل شرایط اقلیمی و نوسان رطوبت، تمام بدنه‌های زیر سینک از پنل ام‌دی‌اف ضد رطوبت تأمین شد.',
                    'en' => 'Given the local climate and humidity swings, every under-sink carcass was supplied in moisture-resistant MDF.',
                ],
            ],
        ];
    }
}
