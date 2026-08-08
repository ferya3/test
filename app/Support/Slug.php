<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Latin slug generation for Persian-first content.
 *
 * `Str::slug()` strips non-ASCII outright, so a Persian-only title would reduce
 * to an empty string. Persian/Arabic letters are transliterated to a latin
 * approximation first, which keeps URLs readable, stable and SEO-friendly
 * without exposing percent-encoded UTF-8.
 */
final class Slug
{
    /**
     * @var array<string, string>
     */
    private const array TRANSLITERATIONS = [
        // Persian-specific letters first: they must win over the Arabic forms.
        'پ' => 'p', 'چ' => 'ch', 'ژ' => 'zh', 'گ' => 'g', 'ک' => 'k',
        'ی' => 'y', 'ي' => 'y', 'ۀ' => 'e', 'ة' => 'h',

        'ا' => 'a', 'آ' => 'a', 'أ' => 'a', 'إ' => 'e', 'ٱ' => 'a',
        'ب' => 'b', 'ت' => 't', 'ث' => 's', 'ج' => 'j',
        'ح' => 'h', 'خ' => 'kh', 'د' => 'd', 'ذ' => 'z',
        'ر' => 'r', 'ز' => 'z', 'س' => 's', 'ش' => 'sh',
        'ص' => 's', 'ض' => 'z', 'ط' => 't', 'ظ' => 'z',
        'ع' => 'a', 'غ' => 'gh', 'ف' => 'f', 'ق' => 'gh',
        'ل' => 'l', 'م' => 'm', 'ن' => 'n', 'و' => 'v',
        'ه' => 'h', 'ك' => 'k',
        'ء' => '', 'ؤ' => 'o', 'ئ' => 'y',

        // Zero-width non-joiner and friends become word separators.
        "\u{200c}" => '-', "\u{200d}" => '-', "\u{200e}" => '-', "\u{200f}" => '-',

        // Diacritics carry no phonetic weight in a slug.
        "\u{064b}" => '', "\u{064c}" => '', "\u{064d}" => '', "\u{064e}" => '',
        "\u{064f}" => '', "\u{0650}" => '', "\u{0651}" => '', "\u{0652}" => '',

        // Persian and Arabic-Indic digits.
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
        '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
        '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    ];

    /**
     * @param  string  $fallback  used when the source transliterates to nothing
     */
    public static function make(string $source, string $fallback = 'item'): string
    {
        $slug = Str::slug(strtr($source, self::TRANSLITERATIONS));

        return $slug === '' ? $fallback : $slug;
    }
}
