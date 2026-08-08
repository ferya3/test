@props([
    'heading',
    'body' => null,
])

<div {{ $attributes->class(['flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center']) }}>
    <svg class="size-10 text-text-placeholder" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <h2 class="text-h4">{{ $heading }}</h2>

    @if ($body)
        <p class="max-w-md text-body-sm text-text-muted">{{ $body }}</p>
    @endif

    @isset($actions)
        <div class="mt-2 flex flex-wrap justify-center gap-3">{{ $actions }}</div>
    @endisset
</div>
