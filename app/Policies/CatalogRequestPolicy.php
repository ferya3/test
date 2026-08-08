<?php

declare(strict_types=1);

namespace App\Policies;

class CatalogRequestPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'catalog-requests';
    }
}
