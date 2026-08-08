<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="same-origin">

    <title>{{ $title }} — {{ config('app.name') }}</title>

    <link rel="preload" href="{{ asset('fonts/vazirmatn-arabic.woff2') }}" as="font" type="font/woff2" crossorigin>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="grid min-h-dvh place-items-center bg-surface-subtle p-5 text-text antialiased">
    <main class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3 text-center">
            <span aria-hidden="true" class="grid size-11 place-items-center rounded-md bg-surface-inverse">
                <span class="text-body font-bold text-text-inverse">آ</span>
            </span>
            <h1 class="text-h3">{{ $title }}</h1>
            @isset($subtitle)
                <p class="text-body-sm text-text-muted">{{ $subtitle }}</p>
            @endisset
        </div>

        @if ($errors->any())
            <x-ui.alert tone="danger" class="mb-5">
                <ul class="list-inside list-disc">
                    @foreach ($errors->all() as $error)
                        <li>{{ $error }}</li>
                    @endforeach
                </ul>
            </x-ui.alert>
        @endif

        <div class="rounded-lg border border-border bg-surface p-6">
            {{ $slot }}
        </div>
    </main>
</body>
</html>
