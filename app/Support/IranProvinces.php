<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The 31 provinces of Iran, used by the representative locator's province filter
 * and by the contact form's province select.
 *
 * Faker's fa_IR locale has no province formatter, so this is the single source
 * of truth for both seeding and validation.
 */
final class IranProvinces
{
    /**
     * @var list<string>
     */
    public const array ALL = [
        'آذربایجان شرقی',
        'آذربایجان غربی',
        'اردبیل',
        'اصفهان',
        'البرز',
        'ایلام',
        'بوشهر',
        'تهران',
        'چهارمحال و بختیاری',
        'خراسان جنوبی',
        'خراسان رضوی',
        'خراسان شمالی',
        'خوزستان',
        'زنجان',
        'سمنان',
        'سیستان و بلوچستان',
        'فارس',
        'قزوین',
        'قم',
        'کردستان',
        'کرمان',
        'کرمانشاه',
        'کهگیلویه و بویراحمد',
        'گلستان',
        'گیلان',
        'لرستان',
        'مازندران',
        'مرکزی',
        'هرمزگان',
        'همدان',
        'یزد',
    ];

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return self::ALL;
    }

    public static function random(): string
    {
        return self::ALL[array_rand(self::ALL)];
    }

    public static function exists(string $province): bool
    {
        return in_array($province, self::ALL, true);
    }
}
