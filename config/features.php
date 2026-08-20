<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Optional front-end features
    |--------------------------------------------------------------------------
    |
    | Both of these are built and tested; they are simply not wanted on the
    | public site yet. Switching them off here rather than deleting the code
    | means turning them back on is one line and no rebuild of anything.
    |
    | Read through config() and never env() outside this file — production runs
    | `artisan optimize`, after which env() returns null everywhere else. See
    | docs/DEPLOYMENT.md section 4.
    |
    */

    /*
    | The light/dark switch in the header.
    |
    | Hiding the control is not enough on its own: the palette also follows the
    | operating system through `prefers-color-scheme`, so a visitor whose phone
    | is in dark mode would still get a dark site with no way back. With this
    | off, the layout pins the document to the light theme, which is what the
    | `:root:not([data-theme='light'])` guard in app.css exists for.
    */
    'theme_toggle' => (bool) env('FEATURE_THEME_TOGGLE', false),

    /*
    | The Persian/English switcher in the header, mobile menu and footer.
    |
    | The English routes stay mounted and keep working when visited directly —
    | this only stops the site advertising them, so nothing has to be rebuilt
    | when the translations are ready.
    */
    'language_switcher' => (bool) env('FEATURE_LANGUAGE_SWITCHER', false),

];
