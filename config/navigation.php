<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Site navigation
|--------------------------------------------------------------------------
|
| Paths — not route names — are the contract between navigation and routing,
| because the same path is mounted twice (once per locale) and is resolved
| through LocaleManager::url(). Labels are translation keys.
|
*/

return [

    'primary' => [
        [
            'label' => 'nav.products',
            'path' => '/products',
            'children' => [
                ['label' => 'nav.categories', 'path' => '/categories'],
                ['label' => 'nav.colors_and_decor', 'path' => '/colors-and-decor'],
                ['label' => 'nav.catalog', 'path' => '/catalog'],
            ],
        ],
        [
            'label' => 'nav.factory',
            'path' => '/factory',
            'children' => [
                ['label' => 'nav.about', 'path' => '/about'],
                ['label' => 'nav.production_process', 'path' => '/production-process'],
                ['label' => 'nav.quality_control', 'path' => '/quality-control'],
                ['label' => 'nav.certificates', 'path' => '/certificates'],
            ],
        ],
        ['label' => 'nav.projects', 'path' => '/projects'],
        ['label' => 'nav.articles', 'path' => '/articles'],
        ['label' => 'nav.representatives', 'path' => '/representatives'],
        ['label' => 'nav.contact', 'path' => '/contact'],
    ],

    'footer' => [
        'products' => [
            ['label' => 'nav.products', 'path' => '/products'],
            ['label' => 'nav.categories', 'path' => '/categories'],
            ['label' => 'nav.colors_and_decor', 'path' => '/colors-and-decor'],
            ['label' => 'nav.catalog', 'path' => '/catalog'],
        ],
        'factory' => [
            ['label' => 'nav.about', 'path' => '/about'],
            ['label' => 'nav.factory', 'path' => '/factory'],
            ['label' => 'nav.production_process', 'path' => '/production-process'],
            ['label' => 'nav.quality_control', 'path' => '/quality-control'],
        ],
        'company' => [
            ['label' => 'nav.projects', 'path' => '/projects'],
            ['label' => 'nav.certificates', 'path' => '/certificates'],
            ['label' => 'nav.articles', 'path' => '/articles'],
            ['label' => 'nav.representatives', 'path' => '/representatives'],
            ['label' => 'nav.contact', 'path' => '/contact'],
        ],
    ],

];
