<?php

declare(strict_types=1);

namespace App\Policies;

class ArticlePolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'articles';
    }
}
