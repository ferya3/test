<?php

declare(strict_types=1);

namespace App\Policies;

class CatalogPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'catalogs';
    }
}
