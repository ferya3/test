<?php

declare(strict_types=1);

namespace App\Policies;

class UserPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'users';
    }
}
