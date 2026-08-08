<?php

declare(strict_types=1);

namespace App\Policies;

class MediaPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'media';
    }
}
