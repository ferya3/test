<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Default locale
    |--------------------------------------------------------------------------
    |
    | Persian is the primary language and is served from the site root with no
    | URL prefix. It is also the last-resort fallback when a translation is
    | missing in every other locale.
    |
    */

    'default' => 'fa',

    /*
    |--------------------------------------------------------------------------
    | Supported locales
    |--------------------------------------------------------------------------
    |
    | `prefix` is the URL segment the locale is mounted under; an empty prefix
    | means the site root. `dir` drives the <html dir> attribute and the
    | logical-property direction of the whole design system.
    |
    | `hreflang` is emitted in alternate link tags, so it must be a valid
    | BCP 47 tag rather than an internal locale key.
    |
    */

    'locales' => [
        'fa' => [
            'name' => 'فارسی',
            'native' => 'فارسی',
            'prefix' => '',
            'dir' => 'rtl',
            'hreflang' => 'fa-IR',
            'font' => 'vazirmatn',
        ],
        'en' => [
            'name' => 'English',
            'native' => 'English',
            'prefix' => 'en',
            'dir' => 'ltr',
            'hreflang' => 'en',
            'font' => 'inter',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | x-default locale
    |--------------------------------------------------------------------------
    |
    | The locale search engines should treat as the unspecified-language
    | fallback in hreflang annotations.
    |
    */

    'x_default' => 'fa',

];
