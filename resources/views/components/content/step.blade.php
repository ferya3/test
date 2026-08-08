@props([
    'number',
    'heading',
    'body' => null,
    'media' => null,
])

<li {{ $attributes->class(['relative flex gap-5 sm:gap-8']) }}>
    {{-- Connector line, drawn between the step markers. --}}
    <div class="flex flex-col items-center">
        <span
            aria-hidden="true"
            class="grid size-11 shrink-0 place-items-center rounded-full border border-accent-tint-border bg-accent-tint text-body-sm font-bold text-accent-tint-text"
        >
            <x-ui.measure :value="$number" dir="ltr" />
        </span>
        <span aria-hidden="true" class="mt-2 w-px flex-1 bg-border group-last:hidden"></span>
    </div>

    <div class="flex-1 pb-10">
        <h3 class="text-h4">{{ $heading }}</h3>

        @if ($body)
            <p class="mt-2 max-w-content text-body text-text-secondary">{{ $body }}</p>
        @endif

        @if ($media)
            <x-media.picture
                :media="$media"
                :alt="$heading"
                ratio="16/9"
                sizes="(min-width: 768px) 45vw, 92vw"
                class="mt-4 max-w-xl rounded-lg"
            />
        @endif
    </div>
</li>
