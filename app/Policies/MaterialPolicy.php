<?php

declare(strict_types=1);

namespace App\Policies;

class MaterialPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'materials';
    }
}
