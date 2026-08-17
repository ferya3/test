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
     * `portrait` is the exception, and is sized by ratio rather than by height:
     * a 1080x1920 frame, which is the shape a phone-format hero photograph is
     * shot in. On a phone that is close to full screen and the intent holds. On
     * a wide desktop the same ratio would be over three thousand pixels tall,
     * so it is capped at the viewport — the frame stays portrait, the image
     * still covers it, and the page remains navigable. Raise the cap and the
     * hero becomes a page of its own that the visitor has to scroll past.
     */
    $heights = [
        'sm' => 'min-h-[34svh] md:min-h-[42svh]',
        'default' => 'min-h-[44svh] md:min-h-[58svh]',
        'lg' => 'min-h-[54svh] md:min-h-[72svh]',
        'portrait' => 'aspect-[1080/1920] max-h-[100svh] min-h-[34svh]',
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
