{{--
    The single entry point for every image on the site.

    Always emits intrinsic width and height (or an aspect-ratio frame) so an
    image can never shift the page while it loads, and always serves AVIF then
    WebP before the original. Nothing else should write a bare <img>.

    Pass `priority` for the one above-the-fold LCP image per page; everything
    else stays lazy.
--}}
@props([
    // App\Models\Media|null
    'media' => null,
    // Overrides the media record's own alt text. Pass an empty string for a
    // purely decorative image so screen readers skip it.
    'alt' => null,
    // The `sizes` attribute. Getting this wrong is the most common cause of a
    // browser downloading a needlessly large image, so it has no silent default
    // beyond full viewport width.
    'sizes' => '100vw',
    // '16/9', '4/3', '1/1', … renders inside a ratio frame with object-cover.
    'ratio' => null,
    // Fills a positioned parent instead of sitting in the flow — for an image
    // used as a backdrop, where the parent's height comes from somewhere else.
    //
    // Without this the only way to get cover behaviour was to pass a `ratio`,
    // because the rule that produces it hangs off the `.media-frame` class that
    // a ratio adds. The hero passed neither and got `h-auto`, which Tailwind
    // emits after `size-full` and therefore wins: the image took its intrinsic
    // height and left the rest of the hero empty.
    'fill' => false,
    'priority' => false,
    'class' => '',
    'imgClass' => '',
])

@php
    $alternative = $alt ?? $media?->translate('alt') ?? '';

    $avif = $media?->srcset('avif');
    $webp = $media?->srcset('webp');

    // The widest generated derivative is a better <img src> than the original,
    // which may be a very large master file.
    $fallbackSrc = null;

    if ($media !== null) {
        $widths = $media->conversionWidths('webp');
        $fallbackSrc = $widths === []
            ? $media->url()
            : $media->conversionUrl('webp', end($widths)) ?? $media->url();
    }

    // No `h-auto` in the fill case: it is the utility that beat `size-full` and
    // stopped the image covering its box.
    $imgClasses = trim(($fill ? 'absolute inset-0 size-full object-cover ' : 'block h-auto w-full ').$imgClass);
@endphp

@if ($media === null)
    {{--
        No image attached. Renders a neutral placeholder that still reserves
        layout space, rather than a broken image icon.
    --}}
    <div
        {{ $attributes->class([
            'panel-placeholder flex items-center justify-center',
            $class,
        ]) }}
        @style(['aspect-ratio: '.str_replace('/', ' / ', (string) $ratio) => $ratio])
        role="img"
        aria-label="{{ $alternative !== '' ? $alternative : __('ui.image_unavailable') }}"
    >
        {{-- A stack of pressed sheets rather than a broken-image glyph: a
             catalogue that has not had its photography uploaded yet should look
             unfinished, not broken. --}}
        <svg class="size-12 text-accent opacity-30" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M6 17 24 9l18 8-18 8-18-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <path d="m6 25 18 8 18-8" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <path d="m6 33 18 8 18-8" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        </svg>
    </div>
@else
    <div
        {{ $attributes->class([
            $class,
            'media-frame' => $ratio !== null,
        ]) }}
        @style(['aspect-ratio: '.str_replace('/', ' / ', (string) $ratio) => $ratio])
    >
        <picture>
            @if ($avif)
                <source type="image/avif" srcset="{{ $avif }}" sizes="{{ $sizes }}">
            @endif

            @if ($webp)
                <source type="image/webp" srcset="{{ $webp }}" sizes="{{ $sizes }}">
            @endif

            <img
                src="{{ $fallbackSrc }}"
                alt="{{ $alternative }}"
                @if ($media->width) width="{{ $media->width }}" @endif
                @if ($media->height) height="{{ $media->height }}" @endif
                {{-- The LCP image must not be lazy, and gets priority in the
                     browser's fetch queue. --}}
                loading="{{ $priority ? 'eager' : 'lazy' }}"
                fetchpriority="{{ $priority ? 'high' : 'auto' }}"
                decoding="{{ $priority ? 'sync' : 'async' }}"
                class="{{ $imgClasses }}"
            >
        </picture>
    </div>
@endif
