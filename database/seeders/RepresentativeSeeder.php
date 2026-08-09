<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Representative;
use Illuminate\Database\Seeder;

class RepresentativeSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->representatives() as $position => $definition) {
            Representative::updateOrCreate(
                ['slug' => $definition['slug']],
                [
                    'name' => $definition['name'],
                    'company' => $definition['company'],
                    'province' => $definition['province'],
                    'city' => $definition['city'],
                    'address' => $definition['address'],
                    'phone' => $definition['phone'],
                    'mobile' => $definition['mobile'],
                    'email' => $definition['email'],
                    'latitude' => $definition['latitude'],
                    'longitude' => $definition['longitude'],
                    'is_active' => true,
                    'is_featured' => $position < 2,
                    'position' => $position,
                ],
            );
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function representatives(): array
    {
        return [
            [
                'slug' => 'tehran-central',
                'name' => ['fa' => 'نمایندگی مرکزی تهران', 'en' => 'Tehran Central Branch'],
                'company' => ['fa' => 'بازرگانی آرتاویل تهران', 'en' => 'Artavil Trading Tehran'],
                'province' => 'تهران',
                'city' => 'تهران',
                'address' => [
                    'fa' => 'خیابان آزادی، نبش خیابان اسکندری، پلاک ۱۲۰',
                    'en' => '120 Azadi Street, corner of Eskandari Street',
                ],
                'phone' => '+98 21 6690 1120',
                'mobile' => '+98 912 100 2030',
                'email' => 'tehran@example.com',
                'latitude' => 35.7009,
                'longitude' => 51.3705,
            ],
            [
                'slug' => 'karaj-branch',
                'name' => ['fa' => 'نمایندگی کرج', 'en' => 'Karaj Branch'],
                'company' => ['fa' => 'چوب و پنل البرز', 'en' => 'Alborz Wood & Panel'],
                'province' => 'البرز',
                'city' => 'کرج',
                'address' => [
                    'fa' => 'جاده ملارد، شهرک صناعی، بلوک ۷',
                    'en' => 'Malard Road, Industrial Estate, Block 7',
                ],
                'phone' => '+98 26 3420 5580',
                'mobile' => '+98 912 220 4410',
                'email' => 'karaj@example.com',
                'latitude' => 35.8228,
                'longitude' => 50.9689,
            ],
            [
                'slug' => 'isfahan-branch',
                'name' => ['fa' => 'نمایندگی اصفهان', 'en' => 'Isfahan Branch'],
                'company' => ['fa' => 'دکوراسیون سپاهان', 'en' => 'Sepahan Decoration'],
                'province' => 'اصفهان',
                'city' => 'اصفهان',
                'address' => [
                    'fa' => 'خیابان امام خمینی، بعد از میدان استقلال',
                    'en' => 'Imam Khomeini Street, past Esteghlal Square',
                ],
                'phone' => '+98 31 3376 4420',
                'mobile' => '+98 913 330 5520',
                'email' => 'isfahan@example.com',
                'latitude' => 32.6412,
                'longitude' => 51.6301,
            ],
            [
                'slug' => 'mashhad-branch',
                'name' => ['fa' => 'نمایندگی مشهد', 'en' => 'Mashhad Branch'],
                'company' => ['fa' => 'پنل خراسان', 'en' => 'Khorasan Panel'],
                'province' => 'خراسان رضوی',
                'city' => 'مشهد',
                'address' => [
                    'fa' => 'بلوار وکیل‌آباد، نبش خیابان هفتم',
                    'en' => 'Vakilabad Boulevard, corner of 7th Street',
                ],
                'phone' => '+98 51 3865 7710',
                'mobile' => '+98 915 440 6630',
                'email' => 'mashhad@example.com',
                'latitude' => 36.3187,
                'longitude' => 59.5290,
            ],
            [
                'slug' => 'shiraz-branch',
                'name' => ['fa' => 'نمایندگی شیراز', 'en' => 'Shiraz Branch'],
                'company' => ['fa' => 'صنایع چوب فارس', 'en' => 'Fars Wood Industries'],
                'province' => 'فارس',
                'city' => 'شیراز',
                'address' => [
                    'fa' => 'بلوار مدرس، روبه‌روی شهرک صناعی',
                    'en' => 'Modares Boulevard, opposite the Industrial Estate',
                ],
                'phone' => '+98 71 3728 8840',
                'mobile' => '+98 917 550 7740',
                'email' => 'shiraz@example.com',
                'latitude' => 29.6100,
                'longitude' => 52.5480,
            ],
            [
                'slug' => 'tabriz-branch',
                'name' => ['fa' => 'نمایندگی تبریز', 'en' => 'Tabriz Branch'],
                'company' => ['fa' => 'پنل آذر', 'en' => 'Azar Panel'],
                'province' => 'آذربایجان شرقی',
                'city' => 'تبریز',
                'address' => [
                    'fa' => 'جاده تهران، کیلومتر ۵، شهرک چرم‌سازان',
                    'en' => 'Tehran Road km 5, Leather Makers Estate',
                ],
                'phone' => '+98 41 3455 9910',
                'mobile' => '+98 914 660 8850',
                'email' => 'tabriz@example.com',
                'latitude' => 38.0470,
                'longitude' => 46.3200,
            ],
            [
                'slug' => 'ahvaz-branch',
                'name' => ['fa' => 'نمایندگی اهواز', 'en' => 'Ahvaz Branch'],
                'company' => ['fa' => 'بازرگانی کارون', 'en' => 'Karun Trading'],
                'province' => 'خوزستان',
                'city' => 'اهواز',
                'address' => [
                    'fa' => 'کیانپارس، خیابان اصلی، پلاک ۴۵',
                    'en' => 'Kianpars, Main Street, No. 45',
                ],
                'phone' => '+98 61 3336 2210',
                'mobile' => '+98 916 770 9960',
                'email' => 'ahvaz@example.com',
                'latitude' => 31.3300,
                'longitude' => 48.6690,
            ],
            [
                'slug' => 'rasht-branch',
                'name' => ['fa' => 'نمایندگی رشت', 'en' => 'Rasht Branch'],
                'company' => ['fa' => 'چوب گیلان', 'en' => 'Gilan Wood'],
                'province' => 'گیلان',
                'city' => 'رشت',
                'address' => [
                    'fa' => 'جاده لاکان، نرسیده به شهرک صناعی',
                    'en' => 'Lakan Road, before the Industrial Estate',
                ],
                'phone' => '+98 13 3355 4430',
                'mobile' => '+98 911 880 1170',
                'email' => 'rasht@example.com',
                'latitude' => 37.2560,
                'longitude' => 49.5890,
            ],
        ];
    }
}
