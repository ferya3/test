<?php

declare(strict_types=1);

namespace App\Policies;

class ThicknessPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'thicknesses';
    }
}
