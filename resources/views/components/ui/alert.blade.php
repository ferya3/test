@props([
    'tone' => 'info',
    'title' => null,
    'dismissible' => false,
])

@php
    $tones = [
        'info' => ['bg-info-tint text-info-tint-text', 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4h1.5v1.5h-1.5V4Zm0 2.75h1.5V12h-1.5V6.75Z'],
        'success' => ['bg-success-tint text-success-tint-text', 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.28 4.72-4 4a.75.75 0 0 1-1.06 0l-2-2 1.06-1.06L6.75 8.6l3.47-3.47 1.06 1.09Z'],
        'warning' => ['bg-warning-tint text-warning-tint-text', 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6h1.5V12h-1.5v-1.5Z'],
        'danger' => ['bg-danger-tint text-danger-tint-text', 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6h1.5V12h-1.5v-1.5Z'],
    ];

    [$toneClasses, $iconPath] = $tones[$tone] ?? $tones['info'];

    // Errors interrupt; everything else is announced when the user reaches it.
    $role = in_array($tone, ['danger', 'warning'], true) ? 'alert' : 'status';
@endphp

<div
    role="{{ $role }}"
    @if ($dismissible) x-data="{ shown: true }" x-show="shown" x-collapse @endif
    {{ $attributes->class(['flex items-start gap-3 rounded-md p-4 text-body-sm', $toneClasses]) }}
>
    <svg class="mt-0.5 size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="{{ $iconPath }}" />
    </svg>

    <div class="flex-1 space-y-1">
        @if ($title)
            <p class="font-semibold">{{ $title }}</p>
        @endif

        <div>{{ $slot }}</div>
    </div>

    @if ($dismissible)
        <button
            type="button"
            x-on:click="shown = false"
            class="-m-1 rounded-xs p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
            <span class="sr-only">{{ __('ui.dismiss') }}</span>
            <svg class="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
        </button>
    @endif
</div>
