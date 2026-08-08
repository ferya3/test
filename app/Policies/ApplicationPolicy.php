<?php

declare(strict_types=1);

namespace App\Policies;

class ApplicationPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'applications';
    }
}
