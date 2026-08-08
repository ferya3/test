<?php

declare(strict_types=1);

namespace App\Support\Enums;

/**
 * A backed enum that can present itself to a human.
 *
 * The admin renders select fields generically, which means it calls `label()`
 * on whatever enum a cast hands back. Without a contract that call is a duck
 * type — correct until someone adds an enum that lacks the method, at which
 * point a list page fatals instead of failing to compile.
 */
interface HasLabel
{
    public function label(): string;
}
