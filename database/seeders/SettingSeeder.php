<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->settings() as $key => $definition) {
            Setting::updateOrCreate(
                ['key' => $key],
                [
                    'value' => $definition['value'],
                    'group' => $definition['group'],
                    'is_public' => $definition['is_public'] ?? true,
                ],
            );
        }
    }

    /**
     * @return array<string, array{value: mixed, group: string, is_public?: bool}>
     */
    private function settings(): array
    {
        return [
            'company_name' => [
                'value' => ['fa' => 'صنایع پنل آرکا', 'en' => 'Arka Panel Industries'],
                'group' => 'company',
            ],
            'company_tagline' => [
                'value' => [
                    'fa' => 'تولیدکننده پنل کابینت آشپزخانه و پنل تزئینی',
                    'en' => 'Manufacturer of kitchen cabinet and decorative panels',
                ],
                'group' => 'company',
            ],
            'company_description' => [
                'value' => [
                    'fa' => 'کارخانه تولید پنل کابینت و پنل تزئینی با خط تولید تمام‌اتوماتیک و آزمایشگاه کنترل کیفیت.',
                    'en' => 'Cabinet and decorative panel factory with a fully automated production line and an in-house quality control laboratory.',
                ],
                'group' => 'company',
            ],
            'founded_year' => ['value' => 1996, 'group' => 'company'],

            /*
             * The block below the homepage hero. Kept in settings rather than
             * hard-coded in the Blade template so the factory can rewrite its
             * own introduction without a deploy — which is the whole point of
             * having an admin panel.
             *
             * `home_intro_body` is rendered as paragraphs split on blank lines.
             */
            'home_intro_overline' => [
                'value' => ['fa' => 'دربارهٔ کارخانه', 'en' => 'About the factory'],
                'group' => 'home',
            ],
            'home_intro_heading' => [
                'value' => [
                    'fa' => 'ورق اچ‌پی‌ال، از پرس تا برش نهایی',
                    'en' => 'HPL sheets, from the press to the final cut',
                ],
                'group' => 'home',
            ],
            'home_intro_body' => [
                'value' => [
                    'fa' => "ما ورق اچ‌پی‌ال تولید می‌کنیم: لایه‌های کاغذ کرافت آغشته به رزین که زیر فشار و حرارت بالا به یک سطح یکپارچه و مقاوم تبدیل می‌شوند. همین یک فرآیند، پایهٔ هر دو گروه کالای ماست.\n\nخط تولید تمام‌اتوماتیک، آزمایشگاه کنترل کیفیت داخلی و انبار دائمی ورق به ما اجازه می‌دهد سفارش‌های کارگاهی و پروژه‌های بزرگ را با همان ثبات رنگ و ضخامت تحویل بدهیم.",
                    'en' => "We manufacture HPL: kraft layers impregnated with resin and pressed under heat into one solid, hard-wearing surface. That single process is the basis of both of our product groups.\n\nAn automated production line, an in-house quality laboratory and a permanent sheet inventory let us serve both single-workshop orders and large projects with the same consistency of colour and thickness.",
                ],
                'group' => 'home',
            ],

            'contact_phone' => ['value' => '+98 21 1234 5678', 'group' => 'contact'],
            'contact_sales_phone' => ['value' => '+98 21 1234 5679', 'group' => 'contact'],
            'contact_email' => ['value' => 'info@example.com', 'group' => 'contact'],
            'contact_sales_email' => ['value' => 'sales@example.com', 'group' => 'contact'],
            'contact_address' => [
                'value' => [
                    'fa' => 'شهرک صناعی، کیلومتر ۲۵ جاده مخصوص، تهران',
                    'en' => 'Industrial Zone, km 25 Special Road, Tehran, Iran',
                ],
                'group' => 'contact',
            ],
            'contact_working_hours' => [
                'value' => [
                    'fa' => 'شنبه تا چهارشنبه، ۸ تا ۱۷ — پنجشنبه، ۸ تا ۱۳',
                    'en' => 'Saturday–Wednesday 08:00–17:00 · Thursday 08:00–13:00',
                ],
                'group' => 'contact',
            ],
            'contact_latitude' => ['value' => 35.6892, 'group' => 'contact'],
            'contact_longitude' => ['value' => 51.3890, 'group' => 'contact'],

            'social_instagram' => ['value' => 'https://instagram.com/example', 'group' => 'social'],
            'social_linkedin' => ['value' => 'https://linkedin.com/company/example', 'group' => 'social'],
            'social_youtube' => ['value' => null, 'group' => 'social'],
            'social_telegram' => ['value' => null, 'group' => 'social'],

            'seo_default_title' => [
                'value' => [
                    'fa' => 'پنل کابینت و پنل تزئینی | صنایع پنل آرکا',
                    'en' => 'Cabinet & Decorative Panels | Arka Panel Industries',
                ],
                'group' => 'seo',
            ],
            'seo_default_description' => [
                'value' => [
                    'fa' => 'تولید پنل کابینت آشپزخانه و پنل تزئینی با کیفیت صادراتی، تنوع رنگ و طرح، و گواهی‌نامه‌های بین‌المللی.',
                    'en' => 'Export-grade kitchen cabinet panels and decorative panels, a wide colour and decor range, and international certification.',
                ],
                'group' => 'seo',
            ],
            'seo_default_og_media_id' => ['value' => null, 'group' => 'seo'],

            // Analytics container id: not public until an operator sets it.
            'analytics_gtm_id' => ['value' => null, 'group' => 'analytics', 'is_public' => false],

            'lead_notification_email' => [
                'value' => 'sales@example.com',
                'group' => 'notifications',
                'is_public' => false,
            ],
        ];
    }
}
