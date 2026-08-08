@php
    /** @var \App\Services\Localization\LocaleManager $locales */
    $locales = app(\App\Services\Localization\LocaleManager::class);
@endphp

{{--
    Locale-independent: derived from the current request path rather than any
    page-specific data, so every page gets its alternates for free. See
    LocaleManager::alternateUrl() for how the locale prefix is swapped.
--}}
@foreach ($locales->alternates() as $code => $url)
    <link rel="alternate" hreflang="{{ $locales->hreflang($code) }}" href="{{ $url }}">
@endforeach
<link rel="alternate" hreflang="x-default" href="{{ $locales->alternateUrl($locales->xDefault()) }}">
