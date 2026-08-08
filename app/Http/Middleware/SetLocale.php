<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Localization\LocaleManager;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Derives the active locale from the URL prefix and shares the direction with
 * every view.
 *
 * The locale comes from the path only — never from a cookie or Accept-Language
 * header — so a URL always renders the same content for every visitor and for
 * crawlers. That keeps the two language versions independently indexable.
 */
class SetLocale
{
    public function __construct(private readonly LocaleManager $locales) {}

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $this->locales->fromPath($request->path());

        app()->setLocale($locale);

        // Persian and Arabic-Indic digits are formatted by the presentation
        // layer; keeping Carbon on the same locale makes dates agree.
        setlocale(LC_TIME, $locale);

        // Generated URLs keep the active locale's prefix.
        URL::defaults(['locale' => $this->locales->prefix($locale) ?: null]);

        view()->share([
            'currentLocale' => $locale,
            'textDirection' => $this->locales->direction($locale),
            'isRtl' => $this->locales->isRtl($locale),
        ]);

        return $next($request);
    }
}
