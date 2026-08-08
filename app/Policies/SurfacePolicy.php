<?php

declare(strict_types=1);

namespace App\Policies;

class SurfacePolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'surfaces';
    }
}
