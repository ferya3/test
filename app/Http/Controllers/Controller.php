<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    /**
     * Laravel 11 removed this from the base controller. It is added back here
     * because every admin action authorises through a policy, and an
     * authorisation call that silently does not exist is the worst kind of
     * missing check.
     */
    use AuthorizesRequests;
}
