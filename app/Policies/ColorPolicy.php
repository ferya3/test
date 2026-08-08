<?php

declare(strict_types=1);

namespace App\Policies;

class ColorPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'colors';
    }
}
