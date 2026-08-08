@props([
    'tone' => 'default',
    'size' => 'default',
    'width' => 'page',
    'as' => 'section',
])

@php
    $tones = [
        'default' => 'bg-surface',
        'subtle' => 'bg-surface-subtle',
        'inverse' => 'bg-surface-inverse text-text-inverse',
        'none' => '',
    ];

    $sizes = [
        'default' => 'py-section',
        'sm' => 'py-section-sm',
        'none' => '',
    ];
@endphp

<{{ $as }} {{ $attributes->class([$tones[$tone] ?? $tones['default'], $sizes[$size] ?? $sizes['default']]) }}>
    @if ($width === 'none')
        {{ $slot }}
    @else
        <x-layout.container :width="$width">
            {{ $slot }}
        </x-layout.container>
    @endif
</{{ $as }}>
