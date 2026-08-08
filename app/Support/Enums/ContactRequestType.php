<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum ContactRequestType: string implements HasLabel
{
    /** تماس با کارخانه */
    case Contact = 'contact';

    /** استعلام قیمت */
    case Quote = 'quote';

    /** درخواست نمونه */
    case Sample = 'sample';

    /** درخواست نمایندگی */
    case Representation = 'representation';

    public function label(): string
    {
        return __("enums.contact_request_type.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
