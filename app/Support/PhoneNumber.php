<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Iranian phone number handling shared by every public enquiry form.
 */
final class PhoneNumber
{
    /**
     * Mobile (09xxxxxxxxx) or landline with area code, accepting the +98 form
     * and the usual space and dash separators.
     */
    public const string RULE = 'regex:/^(\+?98|0)?[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}$/';

    /**
     * @var array<string, string>
     */
    private const array DIGITS = [
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
        '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
        '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    ];

    /**
     * Persian and Arabic-Indic digits are common in numbers typed or pasted by
     * Iranian visitors, and would otherwise fail the format rule.
     */
    public static function normalise(string $value): string
    {
        return strtr(trim($value), self::DIGITS);
    }
}
