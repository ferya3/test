<?php

declare(strict_types=1);

namespace App\Policies;

class RepresentativePolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'representatives';
    }
}
