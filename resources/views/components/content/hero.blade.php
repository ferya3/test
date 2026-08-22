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
    // Closes the hero with x-content.wave instead of a straight edge.
    'wave' => false,
])

@php
    /*
     * Mobile heights are deliberately shorter than the desktop ones. A hero
     * measured in svh fills the phone screen before a single word of the page
     * has been read; on a phone the job is to introduce and get out of the way.
     *
     * `wide` is the exception, and is sized by ratio rather than by height: a
     * 1920x1080 frame, so a photograph shot at that size fills it exactly and
     * nothing is cropped away.
     *
     * Two bounds, and only one of them survives.
     *
     * The width is capped at 1920, so on a display wider than the photograph
     * the frame stops growing instead of scaling the image up and cropping
     * more of it. At exactly 1920 the image renders one-to-one.
     *
     * There is no height cap. There was — max-h-[100svh] — and it was the bug:
     * a 1920x1080 screen has roughly 900px of viewport, so the cap made the box
     * 1920x900, which is wider than 16:9, and object-cover answered by
     * trimming the top and bottom off the photograph. Ratio alone decides the
     * height now, and the width cap keeps that from ever exceeding 1080.
     *
     * The floor stays: on a phone 16:9 is only about 220px tall, which will not
     * hold a heading, a lead and two buttons. There the image covers the taller
     * box and is cropped at the sides, which is the right trade on a phone.
     */
    $heights = [
        'sm' => 'min-h-[34svh] md:min-h-[42svh]',
        'default' => 'min-h-[44svh] md:min-h-[58svh]',
        'lg' => 'min-h-[54svh] md:min-h-[72svh]',
        'wide' => 'mx-auto w-full max-w-[1920px] aspect-[1920/1080] min-h-[52svh] md:min-h-0',
    ];
@endphp

<section {{ $attributes->class([
    'relative isolate flex items-end overflow-hidden bg-surface-inverse',
    // Without a photograph the hero is a black rectangle; the grain gives it a
    // surface so it reads as a deliberate dark band until an image is uploaded.
    'hero-grain' => $media === null,
    $heights[$size] ?? $heights['default'],
]) }}>
    @if ($media)
        {{-- `fill`, not a ratio: the hero's height is set by the section, and
             the image's job is to cover whatever that turns out to be at this
             viewport width. --}}
        <x-media.picture
            :media="$media"
            alt=""
            priority
            fill
            sizes="100vw"
            class="absolute inset-0 -z-10 size-full"
        />
        <div aria-hidden="true" class="scrim absolute inset-0 -z-10"></div>
    @endif

    @if ($wave)
        <x-content.wave />
    @endif

    {{-- `relative` so the copy paints above the wave's z-0 band rather than
         behind it. Top and bottom padding are set separately rather than with
         `py-*` plus an overriding `pb-*`: which of the two wins would then
         depend on the order Tailwind emits them in, and the wave clearing the
         text is not something to leave to that. --}}
    <x-layout.container @class([
        'relative z-10 pt-12 md:pt-16',
        'pb-12 md:pb-16' => ! $wave,
        // Clears the crest of the wave rather than assuming it is short.
        'pb-20 md:pb-32 lg:pb-40' => $wave,
    ])>
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
