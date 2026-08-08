<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Page;
use App\Models\PageSection;
use App\Support\Enums\PageSectionType;
use App\Support\Enums\PageTemplate;
use Illuminate\Database\Seeder;

/**
 * The four editorial pages and their section content. Slugs match the routes in
 * routes/web.php, so these rows are structural rather than sample data.
 */
class PageSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->pages() as $position => $definition) {
            $page = Page::updateOrCreate(
                ['slug' => $definition['slug']],
                [
                    'template' => $definition['template'],
                    'title' => $definition['title'],
                    'subtitle' => $definition['subtitle'],
                    'body' => $definition['body'] ?? null,
                    'is_active' => true,
                    'position' => $position,
                ],
            );

            foreach ($definition['sections'] as $sectionPosition => $section) {
                PageSection::updateOrCreate(
                    [
                        'page_id' => $page->getKey(),
                        'position' => $sectionPosition,
                    ],
                    [
                        'type' => $section['type'],
                        'heading' => $section['heading'] ?? null,
                        'subheading' => $section['subheading'] ?? null,
                        'body' => $section['body'] ?? null,
                        'data' => $section['data'] ?? null,
                        'is_active' => true,
                    ],
                );
            }
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function pages(): array
    {
        return [
            [
                'slug' => 'about',
                'template' => PageTemplate::About,
                'title' => ['fa' => 'درباره کارخانه', 'en' => 'About the Factory'],
                'subtitle' => [
                    'fa' => 'سه دهه تولید پنل کابینت و پنل تزئینی',
                    'en' => 'Three decades of cabinet and decorative panel manufacturing',
                ],
                'body' => [
                    'fa' => 'از سال ۱۳۷۵ با یک خط پرس آغاز کردیم و امروز با چند خط تولید پیوسته، پنل کابینت و پنل تزئینی را برای بازار داخلی و صادراتی تأمین می‌کنیم.',
                    'en' => 'We began in 1996 with a single press line. Today several continuous production lines supply cabinet and decorative panels to the domestic and export markets.',
                ],
                'sections' => [
                    [
                        'type' => PageSectionType::Stat,
                        'heading' => ['fa' => 'سال تجربه', 'en' => 'Years of experience'],
                        'data' => ['value' => '30'],
                    ],
                    [
                        'type' => PageSectionType::Stat,
                        'heading' => ['fa' => 'ظرفیت سالانه', 'en' => 'Annual capacity'],
                        'data' => ['value' => '1.2M', 'unit_fa' => 'ورق', 'unit_en' => 'sheets'],
                    ],
                    [
                        'type' => PageSectionType::Stat,
                        'heading' => ['fa' => 'کد رنگ و طرح', 'en' => 'Colour and decor codes'],
                        'data' => ['value' => '180+'],
                    ],
                    [
                        'type' => PageSectionType::Stat,
                        'heading' => ['fa' => 'نمایندگی فعال', 'en' => 'Active representatives'],
                        'data' => ['value' => '40+'],
                    ],
                    [
                        'type' => PageSectionType::Text,
                        'heading' => ['fa' => 'مأموریت ما', 'en' => 'Our mission'],
                        'body' => [
                            'fa' => 'تأمین پنلی که نجار بتواند بدون نگرانی از اختلاف ابعاد و اختلاف رنگ بین بچ‌ها، آن را برش بزند و مونتاژ کند. یکنواختی، دقت ابعادی و پایداری رنگ سه معیاری است که تمام فرایند تولید ما حول آن تنظیم شده است.',
                            'en' => 'To supply panels a joiner can cut and assemble without worrying about dimensional drift or colour variation between batches. Uniformity, dimensional accuracy and colour stability are the three criteria our entire process is tuned around.',
                        ],
                    ],
                    [
                        'type' => PageSectionType::Timeline,
                        'heading' => ['fa' => '۱۳۷۵ — آغاز', 'en' => '1996 — Founded'],
                        'body' => [
                            'fa' => 'راه‌اندازی نخستین خط پرس گرم با ظرفیت محدود.',
                            'en' => 'The first hot press line comes online with limited capacity.',
                        ],
                        'data' => ['year' => 1996],
                    ],
                    [
                        'type' => PageSectionType::Timeline,
                        'heading' => ['fa' => '۱۳۸۵ — توسعه', 'en' => '2006 — Expansion'],
                        'body' => [
                            'fa' => 'افزودن خط روکش ملامینه و راه‌اندازی آزمایشگاه کنترل کیفیت.',
                            'en' => 'A melamine facing line is added and the quality laboratory opens.',
                        ],
                        'data' => ['year' => 2006],
                    ],
                    [
                        'type' => PageSectionType::Timeline,
                        'heading' => ['fa' => '۱۳۹۵ — های‌گلاس', 'en' => '2016 — High gloss'],
                        'body' => [
                            'fa' => 'ورود به تولید پنل های‌گلاس و سوپرمات.',
                            'en' => 'High gloss and super matte panel production begins.',
                        ],
                        'data' => ['year' => 2016],
                    ],
                    [
                        'type' => PageSectionType::Timeline,
                        'heading' => ['fa' => '۱۴۰۳ — صادرات', 'en' => '2024 — Export'],
                        'body' => [
                            'fa' => 'دریافت گواهی E1 و آغاز صادرات منطقه‌ای.',
                            'en' => 'E1 certification is granted and regional export starts.',
                        ],
                        'data' => ['year' => 2024],
                    ],
                ],
            ],
            [
                'slug' => 'factory',
                'template' => PageTemplate::Factory,
                'title' => ['fa' => 'کارخانه و تولید', 'en' => 'Factory & Production'],
                'subtitle' => [
                    'fa' => 'خطوط تولید، ماشین‌آلات و ظرفیت',
                    'en' => 'Production lines, machinery and capacity',
                ],
                'sections' => [
                    [
                        'type' => PageSectionType::Feature,
                        'heading' => ['fa' => 'پرس گرم پیوسته', 'en' => 'Continuous hot press'],
                        'body' => [
                            'fa' => 'پرس پیوسته با کنترل دقیق دما و فشار، چسبندگی یکنواخت روکش را در تمام سطح ورق تضمین می‌کند.',
                            'en' => 'A continuous press with tight temperature and pressure control delivers uniform facing adhesion across the whole sheet.',
                        ],
                    ],
                    [
                        'type' => PageSectionType::Feature,
                        'heading' => ['fa' => 'خط روکش ملامینه', 'en' => 'Melamine facing line'],
                        'body' => [
                            'fa' => 'تغذیه خودکار کاغذ ملامینه و تنظیم ثبت رگه، تکرارپذیری طرح را بین بچ‌ها حفظ می‌کند.',
                            'en' => 'Automated melamine paper feed with grain registration keeps decor repeatable between batches.',
                        ],
                    ],
                    [
                        'type' => PageSectionType::Feature,
                        'heading' => ['fa' => 'برش و ابعادزنی CNC', 'en' => 'CNC sizing and cutting'],
                        'body' => [
                            'fa' => 'اره پانل CNC با تلورانس ±۰٫۵ میلی‌متر، ابعاد نهایی ورق را تثبیت می‌کند.',
                            'en' => 'A CNC panel saw holds final sheet dimensions to ±0.5 mm.',
                        ],
                    ],
                    [
                        'type' => PageSectionType::Feature,
                        'heading' => ['fa' => 'انبار و بارگیری', 'en' => 'Warehousing and dispatch'],
                        'body' => [
                            'fa' => 'انبار قفسه‌بندی‌شده با بارگیری مسقف، ورق را از رطوبت و ضربه در حین حمل محافظت می‌کند.',
                            'en' => 'Racked warehousing with covered loading protects sheets from moisture and handling damage in transit.',
                        ],
                    ],
                ],
            ],
            [
                'slug' => 'production-process',
                'template' => PageTemplate::Process,
                'title' => ['fa' => 'فرایند تولید', 'en' => 'Production Process'],
                'subtitle' => [
                    'fa' => 'از ورود تخته خام تا بارگیری ورق نهایی',
                    'en' => 'From raw board intake to finished sheet dispatch',
                ],
                'sections' => [
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'پذیرش و کنترل تخته خام', 'en' => 'Raw board intake and inspection'],
                        'body' => [
                            'fa' => 'هر پالت تخته خام از نظر چگالی، رطوبت و صافی سطح نمونه‌برداری و ثبت می‌شود.',
                            'en' => 'Every pallet of raw board is sampled and logged for density, moisture content and surface flatness.',
                        ],
                        'data' => ['step' => 1],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'سنباده و آماده‌سازی سطح', 'en' => 'Sanding and surface preparation'],
                        'body' => [
                            'fa' => 'سنباده‌زنی چندمرحله‌ای، ضخامت را یکنواخت و سطح را برای پذیرش روکش آماده می‌کند.',
                            'en' => 'Multi-stage sanding equalises thickness and prepares the surface to accept the facing.',
                        ],
                        'data' => ['step' => 2],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'روکش‌گذاری و پرس', 'en' => 'Facing and pressing'],
                        'body' => [
                            'fa' => 'کاغذ ملامینه یا فیلم تزئینی روی تخته قرار می‌گیرد و در پرس گرم با دما و فشار کنترل‌شده تثبیت می‌شود.',
                            'en' => 'Melamine paper or decorative film is laid onto the board and fixed in the hot press under controlled heat and pressure.',
                        ],
                        'data' => ['step' => 3],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'خنک‌سازی و تثبیت', 'en' => 'Cooling and conditioning'],
                        'body' => [
                            'fa' => 'ورق‌ها پیش از برش در شرایط کنترل‌شده خنک می‌شوند تا تنش داخلی و تاب‌برداشتن حذف شود.',
                            'en' => 'Sheets cool under controlled conditions before cutting, which removes internal stress and prevents warping.',
                        ],
                        'data' => ['step' => 4],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'برش و ابعادزنی', 'en' => 'Cutting and sizing'],
                        'body' => [
                            'fa' => 'اره پانل CNC ورق را به ابعاد سفارش می‌برد و لبه‌ها بازرسی می‌شوند.',
                            'en' => 'A CNC panel saw cuts sheets to the ordered dimensions and edges are inspected.',
                        ],
                        'data' => ['step' => 5],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'کنترل کیفیت نهایی', 'en' => 'Final quality control'],
                        'body' => [
                            'fa' => 'نمونه هر بچ برای چسبندگی، مقاومت خط و خش و تطابق رنگ آزمون می‌شود.',
                            'en' => 'A sample from each batch is tested for adhesion, scratch resistance and colour match.',
                        ],
                        'data' => ['step' => 6],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'بسته‌بندی و بارگیری', 'en' => 'Packing and dispatch'],
                        'body' => [
                            'fa' => 'ورق‌ها لایه‌گذاری، شرینک و روی پالت استاندارد بارگیری می‌شوند.',
                            'en' => 'Sheets are interleaved, shrink-wrapped and loaded on standard pallets.',
                        ],
                        'data' => ['step' => 7],
                    ],
                ],
            ],
            [
                'slug' => 'quality-control',
                'template' => PageTemplate::Quality,
                'title' => ['fa' => 'کنترل کیفیت', 'en' => 'Quality Control'],
                'subtitle' => [
                    'fa' => 'آزمایشگاه کارخانه و آزمون‌های استاندارد',
                    'en' => 'In-house laboratory and standard test regime',
                ],
                'sections' => [
                    [
                        'type' => PageSectionType::Text,
                        'heading' => ['fa' => 'رویکرد ما به کیفیت', 'en' => 'How we approach quality'],
                        'body' => [
                            'fa' => 'کیفیت در انتهای خط بازرسی نمی‌شود، در طول خط ساخته می‌شود. نمونه‌برداری در پنج نقطه از فرایند انجام می‌شود و نتایج هر بچ به شماره سری ورق گره خورده است، بنابراین هر پالت تا مواد اولیه قابل ردیابی است.',
                            'en' => 'Quality is not inspected in at the end of the line; it is built along it. Samples are taken at five points in the process and each batch result is tied to the sheet lot number, so every pallet is traceable back to its raw material.',
                        ],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'آزمون چسبندگی روکش', 'en' => 'Facing adhesion test'],
                        'body' => [
                            'fa' => 'مقاومت جداشدگی روکش از تخته مطابق EN 311 اندازه‌گیری می‌شود.',
                            'en' => 'Surface soundness is measured to EN 311.',
                        ],
                        'data' => ['step' => 1],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'آزمون مقاومت خط و خش', 'en' => 'Scratch resistance test'],
                        'body' => [
                            'fa' => 'سطح با بار استاندارد خراشیده و درجه مقاومت ثبت می‌شود.',
                            'en' => 'The surface is scored under a standard load and the resistance grade recorded.',
                        ],
                        'data' => ['step' => 2],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'آزمون جذب آب و تورم ضخامت', 'en' => 'Water absorption and swelling'],
                        'body' => [
                            'fa' => 'نمونه‌ها ۲۴ ساعت در آب غوطه‌ور و تغییر ضخامت اندازه‌گیری می‌شود.',
                            'en' => 'Samples are immersed for 24 hours and the change in thickness is measured.',
                        ],
                        'data' => ['step' => 3],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'سنجش رهایش فرمالدهید', 'en' => 'Formaldehyde emission'],
                        'body' => [
                            'fa' => 'رهایش فرمالدهید برای تأیید کلاس E1 اندازه‌گیری می‌شود.',
                            'en' => 'Emission is measured to confirm the E1 class.',
                        ],
                        'data' => ['step' => 4],
                    ],
                    [
                        'type' => PageSectionType::Step,
                        'heading' => ['fa' => 'تطابق رنگ بین بچ‌ها', 'en' => 'Batch-to-batch colour match'],
                        'body' => [
                            'fa' => 'هر بچ با نمونه مرجع تحت نور استاندارد D65 مقایسه و ΔE ثبت می‌شود.',
                            'en' => 'Each batch is compared against the reference sample under standard D65 light and ΔE is logged.',
                        ],
                        'data' => ['step' => 5],
                    ],
                ],
            ],
        ];
    }
}
