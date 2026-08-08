<?php

declare(strict_types=1);

namespace App\Policies;

class ProjectPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'projects';
    }
}
