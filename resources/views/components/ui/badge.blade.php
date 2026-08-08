@props([
    'tone' => 'neutral',
    'size' => 'md',
])

@php
    $tones = [
        'neutral' => 'bg-surface-subtle text-text-secondary border-border',
        'accent' => 'bg-accent-tint text-accent-tint-text border-accent-tint-border',
        'success' => 'bg-success-tint text-success-tint-text border-transparent',
        'warning' => 'bg-warning-tint text-warning-tint-text border-transparent',
        'danger' => 'bg-danger-tint text-danger-tint-text border-transparent',
        'info' => 'bg-info-tint text-info-tint-text border-transparent',
        'inverse' => 'bg-surface-inverse text-text-inverse border-transparent',
    ];

    $sizes = [
        'sm' => 'h-5 px-2 text-[0.6875rem]',
        'md' => 'h-6 px-2.5 text-caption',
    ];
@endphp

<span {{ $attributes->class([
    'inline-flex items-center gap-1.5 rounded-sm border font-medium whitespace-nowrap',
    $tones[$tone] ?? $tones['neutral'],
    $sizes[$size] ?? $sizes['md'],
]) }}>
    {{ $slot }}
</span>
