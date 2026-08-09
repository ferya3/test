@props([
    'product',
    // Set on the first row of the grid so the LCP image is not lazy loaded.
    'priority' => false,
    'sizes' => '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw',
])

@php
    $headingId = 'product-'.$product->id;
@endphp

<x-ui.card :href="lroute('products.show', ['product' => $product->slug])" :labelledby="$headingId" padding="none" class="overflow-hidden">
    <x-media.picture
        :media="$product->mainImage"
        :alt="$product->name"
        ratio="4/3"
        :priority="$priority"
        :sizes="$sizes"
        class="w-full"
        img-class="transition-transform duration-500 ease-industrial group-hover:scale-[1.03]"
    />

    <div class="flex flex-1 flex-col gap-2.5 p-5">
        {{-- Wraps rather than overflows: at two cards to a 360px screen a long
             surface name and the product code do not both fit on one line, and
             an English badge is wider than its Persian equivalent. --}}
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            @if ($product->surface)
                <x-ui.badge tone="accent" size="sm" class="min-w-0 max-w-full">{{ $product->surface->name }}</x-ui.badge>
            @else
                <span></span>
            @endif

            {{-- nowrap: at two cards to a phone screen the column is narrow
                 enough to break "PNL-1002" across two lines. --}}
            <x-ui.measure :value="$product->code" dir="ltr" class="whitespace-nowrap text-caption text-text-muted" />
        </div>

        <h3 id="{{ $headingId }}" class="text-h4 text-balance">{{ $product->name }}</h3>

        @if ($product->short_description)
            <p class="line-clamp-2 text-body-sm text-text-muted">{{ $product->short_description }}</p>
        @endif

        <div class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 text-caption text-text-muted">
            @if ($product->decor)
                <span>{{ $product->decor->name }}</span>
            @endif

            @if ($product->color)
                <span class="inline-flex items-center gap-1.5">
                    @if ($product->color->hex)
                        {{--
                            Decorative: the colour name beside it carries the meaning.

                            The swatch colour comes from the database, so it cannot be a
                            Tailwind class and must be an inline style. This is why the CSP
                            allows style-src-attr 'unsafe-inline' — a style attribute
                            cannot execute script, unlike an inline <script>.
                        --}}
                        <span
                            aria-hidden="true"
                            class="size-3 rounded-full border border-border"
                            style="background-color: {{ $product->color->hex }}"
                        ></span>
                    @endif
                    {{ $product->color->name }}
                </span>
            @endif
        </div>
    </div>
</x-ui.card>
