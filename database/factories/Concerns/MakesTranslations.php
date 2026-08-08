<?php

declare(strict_types=1);

namespace Database\Factories\Concerns;

/**
 * Helpers for building the `{"fa": …, "en": …}` payloads that translatable
 * columns store.
 *
 * Faker's fa_IR locale covers names, addresses and phone numbers but falls back
 * to Latin for prose, so Persian copy is drawn from curated domain vocabulary
 * instead — seeded data that actually reads like a panel factory's catalogue.
 */
trait MakesTranslations
{
    /**
     * @return array<string, string>
     */
    protected function bilingual(string $fa, string $en): array
    {
        return ['fa' => $fa, 'en' => $en];
    }

    /**
     * @var list<string>
     */
    private const array FA_PANEL_NOUNS = [
        'پنل', 'ورق', 'صفحه', 'روکش', 'ام‌دی‌اف', 'های‌گلاس',
    ];

    /**
     * @var list<string>
     */
    private const array FA_DECOR_WORDS = [
        'بلوط', 'گردو', 'افرا', 'راش', 'ونگه', 'زبرانو', 'سنگ مرمر',
        'بتن', 'کتان', 'مات مخملی', 'سفید یخی', 'طوسی نوردیک',
    ];

    /**
     * @var list<string>
     */
    private const array EN_DECOR_WORDS = [
        'Oak', 'Walnut', 'Maple', 'Beech', 'Wenge', 'Zebrano', 'Marble',
        'Concrete', 'Linen', 'Velvet Matte', 'Glacier White', 'Nordic Grey',
    ];

    /**
     * A matched Persian/English decor name pair, so the two locales describe
     * the same thing rather than drifting apart.
     *
     * @return array{0: string, 1: string}
     */
    protected function decorNamePair(): array
    {
        $index = array_rand(self::FA_DECOR_WORDS);

        return [self::FA_DECOR_WORDS[$index], self::EN_DECOR_WORDS[$index]];
    }

    protected function faPanelNoun(): string
    {
        return self::FA_PANEL_NOUNS[array_rand(self::FA_PANEL_NOUNS)];
    }

    /**
     * A short Persian paragraph built from domain vocabulary.
     */
    protected function faParagraph(int $sentences = 3): string
    {
        $clauses = [
            'این محصول با استفاده از پرس گرم و چسب مقاوم به رطوبت تولید می‌شود.',
            'سطح یکنواخت و مقاومت بالا در برابر خط و خش از ویژگی‌های اصلی آن است.',
            'مناسب برای بدنه و درب کابینت آشپزخانه و کمد دیواری.',
            'تمام مراحل تولید تحت کنترل کیفیت آزمایشگاه کارخانه انجام می‌شود.',
            'لبه‌های صاف و ابعاد دقیق، برش و مونتاژ را ساده می‌کند.',
            'رنگ‌بندی متنوع و مطابق با استانداردهای روز طراحی داخلی.',
        ];

        shuffle($clauses);

        return implode(' ', array_slice($clauses, 0, max(1, min($sentences, count($clauses)))));
    }
}
