@props([
    'overline' => null,
    'heading' => null,
    'lead' => null,
    'level' => 2,
    'align' => 'start',
    // Constrains the lead paragraph to a comfortable measure.
    'measure' => true,
])

@php
    $tag = 'h'.max(1, min(6, (int) $level));
    $alignment = $align === 'center' ? 'text-center items-center' : 'text-start items-start';
@endphp

<div {{ $attributes->class(['flex flex-col gap-4', $alignment]) }}>
    @if ($overline)
        {{-- Decorative eyebrow: presentational, so it is not a heading element. --}}
        <p class="flex items-center gap-3 text-overline uppercase text-accent-text">
            <span aria-hidden="true" class="h-px w-8 bg-accent"></span>
            {{ $overline }}
        </p>
    @endif

    @if ($heading)
        <{{ $tag }} class="text-h2 text-balance">{{ $heading }}</{{ $tag }}>
    @endif

    @if ($lead)
        <p @class(['text-lead text-text-secondary', 'max-w-content' => $measure])>{{ $lead }}</p>
    @endif

    {{ $slot }}
</div>
