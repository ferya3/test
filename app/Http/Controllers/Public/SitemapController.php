<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Services\Seo\SitemapBuilder;
use Illuminate\Http\Response;

class SitemapController extends Controller
{
    public function __invoke(SitemapBuilder $sitemap): Response
    {
        return response($sitemap->render(), 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
        ]);
    }
}
