@props([
    'heading',
    'body' => null,
    'media' => null,
])

<div {{ $attributes->class(['flex flex-col gap-4']) }}>
    @if ($media)
        <x-media.picture
            :media="$media"
            :alt="$heading"
            ratio="4/3"
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
            class="rounded-lg"
        />
    @endif

    <h3 class="text-h4">{{ $heading }}</h3>

    @if ($body)
        <p class="text-body text-text-secondary">{{ $body }}</p>
    @endif
</div>
