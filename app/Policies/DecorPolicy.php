<?php

declare(strict_types=1);

namespace App\Policies;

class DecorPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'decors';
    }
}
