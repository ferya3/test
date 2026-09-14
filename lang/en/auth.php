<?php

declare(strict_types=1);

return [
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many attempts. Please try again in :seconds seconds.',
    'no_access' => 'This account does not have access to the admin panel.',

    'two_factor' => [
        // The one cause the application cannot fix for the user is a clock:
        // TOTP tolerates thirty seconds either way, so a phone or server that
        // has drifted rejects every code with nothing to explain it.
        'invalid' => 'That code is not valid. If you read it from your app just now, check your device clock.',
    ],
];
