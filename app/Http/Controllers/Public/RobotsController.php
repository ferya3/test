<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use Illuminate\Http\Response;

/**
 * Generated rather than a static public/robots.txt so the Sitemap directive
 * carries the actual APP_URL of whichever environment is serving the
 * request, instead of a value baked in at deploy time. deploy/install-ubuntu.sh
 * only falls back to this route when no static file exists at public/robots.txt.
 */
class RobotsController extends Controller
{
    public function __invoke(): Response
    {
        $lines = [
            'User-agent: *',
            'Disallow: /admin',
            '',
            'Sitemap: '.url('/sitemap.xml'),
        ];

        return response(implode("\n", $lines)."\n", 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
        ]);
    }
}
