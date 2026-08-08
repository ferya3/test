<?php

declare(strict_types=1);

namespace App\Policies;

class ContactRequestPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'contact-requests';
    }
}
