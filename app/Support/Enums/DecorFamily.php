<?php

declare(strict_types=1);

namespace App\Support\Enums;

/**
 * The four decor families, and the only filter the catalogue offers.
 *
 * This list is deliberately short. It is not a taxonomy of every finish a
 * factory could press — it is the one question a buyer asks before anything
 * else ("what does it look like?"), and every extra case makes that question
 * slower to answer rather than more precise.
 *
 * It replaced a five-case list that included `fabric` and `fantasy`, which are
 * distinctions the trade does not draw at this level: a linen texture is a
 * finish, and terrazzo is a stone pattern. The migration that shortened the
 * list moves existing rows accordingly.
 */
enum DecorFamily: string implements HasLabel
{
    case Wood = 'wood';
    case Stone = 'stone';
    case Solid = 'solid';
    case Finish = 'finish';

    public function label(): string
    {
        return __("enums.decor_family.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
