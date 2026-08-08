<!DOCTYPE html>
<html lang="{{ $currentLocale }}" dir="{{ $textDirection }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">

    <title>{{ $seo->title ?? $title ?? config('app.name') }}</title>

    <x-seo.hreflang />
    @isset($seo)
        <x-seo.meta :seo="$seo" />
        <x-seo.schema :seo="$seo" />
    @endisset

    {{--
        Applied before first paint so a stored dark preference never flashes a
        light page. Kept inline and nonce-allowed rather than deferred, because
        any external round trip here would be visible as a flash.
    --}}
    <script nonce="{{ Illuminate\Support\Facades\Vite::cspNonce() }}">
        try {
            var stored = localStorage.getItem('theme');
            if (stored === 'dark' || stored === 'light') {
                document.documentElement.setAttribute('data-theme', stored);
            }
        } catch (e) {}
    </script>

    {{--
        Preload only the face this locale renders. Persian pages need the Arabic
        subset for the LCP heading; English pages need Inter. Preloading both
        would waste ~46KB of the critical path on every page.
    --}}
    @if ($currentLocale === 'fa')
        <link rel="preload" href="{{ asset('fonts/vazirmatn-arabic.woff2') }}" as="font" type="font/woff2" crossorigin>
    @else
        <link rel="preload" href="{{ asset('fonts/inter-latin.woff2') }}" as="font" type="font/woff2" crossorigin>
    @endif

    @vite(['resources/css/app.css', 'resources/js/app.js'])

    @stack('head')
</head>

<body class="min-h-dvh bg-surface text-text antialiased">
    {{-- First tab stop: lets keyboard and screen reader users skip the header. --}}
    <a
        href="#main"
        class="sr-only-focusable absolute z-50 m-3 rounded-md bg-surface-inverse px-4 py-2 text-body-sm font-semibold text-text-inverse"
    >
        {{ __('ui.skip_to_content') }}
    </a>

    <div class="flex min-h-dvh flex-col">
        @include('partials.header')

        <main id="main" class="flex-1">
            {{ $slot }}
        </main>

        @include('partials.footer')
    </div>

    {{-- Mobile-only sticky call to action; hidden once there is room for the header CTA. --}}
    @isset($stickyCta)
        {{ $stickyCta }}
    @endisset

    @stack('scripts')
</body>
</html>
