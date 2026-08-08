<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Default hash driver
    |--------------------------------------------------------------------------
    |
    | Bcrypt rather than argon2id only because it is the option guaranteed to
    | be present on every PHP build this deploys to; argon2id would be the
    | better default where libsodium is assured.
    |
    */

    'driver' => 'bcrypt',

    /*
    |--------------------------------------------------------------------------
    | Bcrypt options
    |--------------------------------------------------------------------------
    |
    | Cost 12 is also the framework's current default, so this file changes
    | nothing today. It exists because "the password cost" is a security
    | property the project states in docs/SECURITY.md, and a stated property
    | that lives only in somebody else's default is one that can change under
    | us on a minor upgrade without anybody noticing.
    |
    | `verify` re-checks that a hash was produced with this driver, so a stored
    | argon2 hash cannot be silently accepted by the bcrypt verifier.
    |
    */

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
        'limit' => null,
    ],

];
