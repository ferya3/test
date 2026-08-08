{{--
    Page hero over industrial photography.

    The image is the LCP element on most pages, so it is passed with priority and
    sits in a ratio frame that reserves its space before it loads. The scrim is
    the one gradient in the design system and exists purely so the text stays
    legible over an arbitrary photograph.
--}}
@props([
    'media' => null,
    'overline' => null,
    'heading',
    'lead' => null,
    'breadcrumbs' => [],
    'size' => 'default',
])

@php
    $heights = [
        'sm' => 'min-h-[38svh] md:min-h-[42svh]',
        'default' => 'min-h-[52svh] md:min-h-[58svh]',
        'lg' => 'min-h-[68svh] md:min-h-[76svh]',
    ];
@endphp

<section {{ $attributes->class(['relative isolate flex items-end overflow-hidden bg-surface-inverse', $heights[$size] ?? $heights['default']]) }}>
    @if ($media)
        <x-media.picture
            :media="$media"
            alt=""
            priority
            sizes="100vw"
            class="absolute inset-0 -z-10 size-full"
            img-class="size-full object-cover"
        />
        <div aria-hidden="true" class="scrim absolute inset-0 -z-10"></div>
    @endif

    <x-layout.container class="py-12 md:py-16">
        @if (count($breadcrumbs) > 0)
            <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-6 [&_*]:!text-white/70 [&_[aria-current]]:!text-white" />
        @endif

        <div class="flex max-w-3xl flex-col gap-4 text-white">
            @if ($overline)
                <p class="flex items-center gap-3 text-overline uppercase text-white/80">
                    <span aria-hidden="true" class="h-px w-8 bg-accent"></span>
                    {{ $overline }}
                </p>
            @endif

            <h1 class="text-h1 text-balance text-white">{{ $heading }}</h1>

            @if ($lead)
                <p class="text-lead text-white/85">{{ $lead }}</p>
            @endif

            @isset($actions)
                <div class="mt-4 flex flex-wrap gap-3">{{ $actions }}</div>
            @endisset
        </div>
    </x-layout.container>
</section>
