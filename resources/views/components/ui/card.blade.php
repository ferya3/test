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
    'relative flex flex-col rounded-lg border',
    $tones[$tone] ?? $tones['default'],
    $paddings[$padding] ?? $paddings['md'],
    // Borders and a restrained lift, not a drop shadow bloom.
    'transition-[border-color,transform] duration-200 ease-industrial '
        .'hover:-translate-y-0.5 hover:border-border-strong '
        .'focus-within:border-border-strong' => $isInteractive,
]) }}>
    {{ $slot }}

    @if ($href)
        {{-- Stretched overlay: the whole card is one hit area and one tab stop. --}}
        <a
            href="{{ $href }}"
            class="absolute inset-0 rounded-lg"
            @if ($labelledby) aria-labelledby="{{ $labelledby }}" @endif
        >
            @unless ($labelledby)
                <span class="sr-only">{{ $linkLabel ?? __('ui.view_details') }}</span>
            @endunless
        </a>
    @endif
</div>
