<?php

declare(strict_types=1);

namespace App\Policies;

class CategoryPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'categories';
    }
}
