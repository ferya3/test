@props([
    'heading',
    'lead' => null,
])

<x-layout.section tone="inverse" size="sm" {{ $attributes }}>
    <div class="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div class="max-w-2xl">
            <h2 class="text-h2 text-balance text-text-inverse">{{ $heading }}</h2>

            @if ($lead)
                <p class="mt-3 text-body-lg text-text-inverse/75">{{ $lead }}</p>
            @endif
        </div>

        <div class="flex shrink-0 flex-wrap gap-3">
            {{ $slot }}
        </div>
    </div>
</x-layout.section>
