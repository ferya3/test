<?php

declare(strict_types=1);

namespace App\Policies;

class CertificatePolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'certificates';
    }
}
