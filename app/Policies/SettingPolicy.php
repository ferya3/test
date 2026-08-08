<?php

declare(strict_types=1);

namespace App\Policies;

class SettingPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'settings';
    }
}
