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
