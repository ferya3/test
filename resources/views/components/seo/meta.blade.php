@props(['seo'])

@php
    /** @var \App\Services\Localization\LocaleManager $locales */
    $locales = app(\App\Services\Localization\LocaleManager::class);
    $current = $locales->current();
    $siteName = app(\App\Services\SettingsRepository::class)->translated('company_name') ?? config('app.name');
@endphp

<meta name="description" content="{{ $seo->description }}">
<meta name="robots" content="{{ $seo->robots }}">
<link rel="canonical" href="{{ $seo->canonical }}">

{{-- Open Graph --}}
<meta property="og:type" content="{{ $seo->ogType }}">
<meta property="og:site_name" content="{{ $siteName }}">
<meta property="og:title" content="{{ $seo->ogTitle }}">
<meta property="og:description" content="{{ $seo->ogDescription }}">
<meta property="og:url" content="{{ $seo->canonical }}">
<meta property="og:locale" content="{{ $locales->hreflang($current) }}">
@foreach ($locales->codes() as $code)
    @continue($code === $current)
    <meta property="og:locale:alternate" content="{{ $locales->hreflang($code) }}">
@endforeach
@if ($seo->ogImage)
    <meta property="og:image" content="{{ $seo->ogImage }}">
    @if ($seo->ogImageWidth)
        <meta property="og:image:width" content="{{ $seo->ogImageWidth }}">
    @endif
    @if ($seo->ogImageHeight)
        <meta property="og:image:height" content="{{ $seo->ogImageHeight }}">
    @endif
@endif

{{-- Twitter Card: only needs its own tags where they differ from Open Graph. --}}
<meta name="twitter:card" content="{{ $seo->ogImage ? $seo->twitterCard : 'summary' }}">
