@props([
    // 'link' turns the whole card into one hit area via a stretched overlay
    // anchor, so the card is a single tab stop rather than several.
    'href' => null,
    'tone' => 'default',
    'padding' => 'md',
    'interactive' => null,
    // id of the heading that names the card, so the overlay link inherits a
    // meaningful accessible name instead of "view details".
    'labelledby' => null,
    'linkLabel' => null,
])

@php
    $isInteractive = $interactive ?? ($href !== null);

    $tones = [
        'default' => 'bg-surface-raised border-border',
        'subtle' => 'bg-surface-subtle border-transparent',
        'outline' => 'bg-transparent border-border',
        'inverse' => 'bg-surface-inverse text-text-inverse border-transparent',
    ];

    $paddings = [
        'none' => '',
        'sm' => 'p-4',
        'md' => 'p-6',
        'lg' => 'p-8',
    ];
@endphp

<div {{ $attributes->class([
    'relative flex flex-col rounded-xl border',
    $tones[$tone] ?? $tones['default'],
    $paddings[$padding] ?? $paddings['md'],
    // A soft ambient shadow that deepens on hover, rather than a border that
    // merely darkens. The lift stays small — this is a panel catalogue, not a
    // card that wants to jump at you.
    'shadow-sm transition-[box-shadow,border-color,transform] duration-300 ease-out-soft '
        .'hover:-translate-y-1 hover:border-border-strong hover:shadow-md '
        .'focus-within:border-border-strong focus-within:shadow-md' => $isInteractive,
]) }}>
    {{ $slot }}

    @if ($href)
        {{-- Stretched overlay: the whole card is one hit area and one tab stop. --}}
        <a
            href="{{ $href }}"
            class="absolute inset-0 rounded-xl"
            @if ($labelledby) aria-labelledby="{{ $labelledby }}" @endif
        >
            @unless ($labelledby)
                <span class="sr-only">{{ $linkLabel ?? __('ui.view_details') }}</span>
            @endunless
        </a>
    @endif
</div>
