<?php

declare(strict_types=1);

namespace App\Policies;

class ProductPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'products';
    }
}
