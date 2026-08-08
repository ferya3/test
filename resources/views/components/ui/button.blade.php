@props([
    'variant' => 'primary',
    'size' => 'md',
    'href' => null,
    'type' => 'button',
    'disabled' => false,
    'fullWidth' => false,
    // Renders a loading state; the label stays in the DOM for screen readers.
    'loading' => false,
])

@php
    // Logical properties throughout (ps/pe, not pl/pr) so one class set renders
    // correctly in both RTL and LTR without a mirrored stylesheet.
    $base = 'group relative inline-flex items-center justify-center gap-2.5 rounded-md '
        .'font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] '
        .'duration-200 ease-industrial select-none '
        .'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring '
        .'active:translate-y-px '
        .'aria-disabled:pointer-events-none aria-disabled:opacity-50';

    $variants = [
        // The single high-emphasis action on a view.
        'primary' => 'bg-accent-surface text-text-on-accent hover:bg-accent-surface-hover',

        // Equal weight, lower colour: used where two actions sit together.
        'secondary' => 'bg-surface-inverse text-text-inverse hover:opacity-90',

        // Hairline border rather than a shadow, matching the industrial tone.
        'outline' => 'border border-border-strong bg-transparent text-text hover:bg-surface-subtle',

        'ghost' => 'bg-transparent text-text hover:bg-surface-subtle',

        // Reads as a link but keeps the button hit area and focus ring.
        'link' => 'bg-transparent text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2 px-0',

        'danger' => 'bg-danger-surface text-white hover:opacity-90',
    ];

    $sizes = [
        'sm' => 'h-9 px-4 text-body-sm',
        'md' => 'h-11 px-6 text-body-sm',
        // Large enough to be the hero CTA without shouting.
        'lg' => 'h-13 px-8 text-body',
    ];

    $classes = [
        $base,
        $variants[$variant] ?? $variants['primary'],
        $variant === 'link' ? 'h-auto' : ($sizes[$size] ?? $sizes['md']),
        'w-full' => $fullWidth,
    ];

    // aria-disabled rather than the disabled attribute on links, which browsers
    // ignore; for buttons both are applied.
    $isInert = $disabled || $loading;
@endphp

@if ($href && ! $isInert)
    <a href="{{ $href }}" {{ $attributes->class($classes) }}>
        {{ $slot }}
    </a>
@elseif ($href)
    <a
        role="link"
        aria-disabled="true"
        tabindex="-1"
        {{ $attributes->class($classes) }}
    >
        {{ $slot }}
    </a>
@else
    <button
        type="{{ $type }}"
        @disabled($isInert)
        @if ($isInert) aria-disabled="true" @endif
        @if ($loading) aria-busy="true" @endif
        {{ $attributes->class($classes) }}
    >
        @if ($loading)
            <x-ui.spinner class="size-4" aria-hidden="true" />
        @endif

        {{ $slot }}
    </button>
@endif
