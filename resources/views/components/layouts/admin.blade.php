<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">

    {{-- The panel must never be indexed, and must not leak referrers to
         third parties when staff click an outbound link. --}}
    <meta name="robots" content="noindex, nofollow, noarchive">
    <meta name="referrer" content="same-origin">

    <title>{{ $title ?? __('admin.panel') }} — {{ $brandName }}</title>

    <script nonce="{{ Illuminate\Support\Facades\Vite::cspNonce() }}">
        try {
            var stored = localStorage.getItem('theme');
            if (stored === 'dark' || stored === 'light') {
                document.documentElement.setAttribute('data-theme', stored);
            }
        } catch (e) {}
    </script>

    <link rel="preload" href="{{ asset('fonts/vazirmatn-arabic.woff2') }}" as="font" type="font/woff2" crossorigin>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="min-h-dvh bg-surface-subtle text-text antialiased">
    <a href="#admin-main" class="sr-only-focusable absolute z-50 m-3 rounded-md bg-surface-inverse px-4 py-2 text-body-sm font-semibold text-text-inverse">
        {{ __('ui.skip_to_content') }}
    </a>

    <div class="flex min-h-dvh flex-col lg:flex-row" x-data="{ nav: false }">
        <x-admin.sidebar />

        <div class="flex min-w-0 flex-1 flex-col">
            <x-admin.topbar :title="$title ?? __('admin.panel')" />

            <main id="admin-main" class="flex-1 p-4 lg:p-8">
                @if (session('status'))
                    <x-ui.alert tone="success" class="mb-6" dismissible>{{ session('status') }}</x-ui.alert>
                @endif

                @if ($errors->any())
                    <x-ui.alert tone="danger" class="mb-6">
                        <ul class="list-inside list-disc">
                            @foreach ($errors->all() as $error)
                                <li>{{ $error }}</li>
                            @endforeach
                        </ul>
                    </x-ui.alert>
                @endif

                {{ $slot }}
            </main>
        </div>
    </div>
</body>
</html>
