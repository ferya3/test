@props([
    // 'page' is the full-width grid; 'content' is the narrow reading measure
    // used for prose, where a long line length hurts legibility.
    'width' => 'page',
])

@php
    $maxWidth = match ($width) {
        'content' => 'max-w-content',
        'wide' => 'max-w-[100rem]',
        default => 'max-w-page',
    };
@endphp

<div {{ $attributes->class(['mx-auto w-full px-gutter', $maxWidth]) }}>
    {{ $slot }}
</div>
