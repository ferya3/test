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

    /*
    | The order is the client's, and it is flat on purpose: seven destinations,
    | no dropdowns to open before you can read the list.
    |
    | The pages that used to hang off "products" and "factory" — categories,
    | colours and decor, the catalogue, the production process, quality control
    | and the certificates — are all still routed and still linked from the
    | footer below. Nothing became unreachable; it stopped being in the header.
    */
    'primary' => [
        ['label' => 'nav.home', 'path' => '/'],
        ['label' => 'nav.products', 'path' => '/products'],
        ['label' => 'nav.projects', 'path' => '/projects'],
        ['label' => 'nav.articles', 'path' => '/articles'],
        ['label' => 'nav.representatives', 'path' => '/representatives'],
        ['label' => 'nav.about', 'path' => '/about'],
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
