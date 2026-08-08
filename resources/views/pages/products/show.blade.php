@php
    $breadcrumbs = array_values(array_filter([
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.products'), 'url' => lroute('products.index')],
        $product->category
            ? ['label' => $product->category->name, 'url' => lroute('categories.show', ['category' => $product->category->slug])]
            : null,
        ['label' => $product->name],
    ]));

    // Single-valued attributes shown as a key/value summary beside the gallery.
    $attributes = array_values(array_filter([
        $product->category ? ['label' => __('product.category'), 'value' => $product->category->name] : null,
        $product->surface ? ['label' => __('product.surface'), 'value' => $product->surface->name] : null,
        $product->decor ? ['label' => __('product.decor'), 'value' => $product->decor->name] : null,
        $product->color ? ['label' => __('product.color'), 'value' => $product->color->name] : null,
        $product->material ? ['label' => __('product.material'), 'value' => $product->material->name] : null,
    ]));
@endphp

<x-layouts.app :title="$product->name">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" />
    </x-layout.section>

    <x-layout.section size="sm">
        <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
            {{-- Gallery ------------------------------------------------- --}}
            <div x-data="{ active: 0 }" class="flex flex-col gap-4">
                {{-- The main image is the LCP element on this page. --}}
                <x-media.picture
                    :media="$product->mainImage"
                    :alt="$product->name"
                    ratio="4/3"
                    priority
                    sizes="(min-width: 1024px) 46vw, 92vw"
                    class="w-full rounded-lg"
                />

                @if ($product->gallery->isNotEmpty())
                    <ul class="grid grid-cols-4 gap-3">
                        @foreach ($product->gallery as $image)
                            <li>
                                <x-media.picture
                                    :media="$image"
                                    :alt="$image->translate('alt') ?? $product->name"
                                    ratio="1/1"
                                    sizes="20vw"
                                    class="w-full rounded-md"
                                />
                            </li>
                        @endforeach
                    </ul>
                @endif
            </div>

            {{-- Summary ------------------------------------------------- --}}
            <div class="flex flex-col gap-6">
                <div class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                        @if ($product->surface)
                            <x-ui.badge tone="accent">{{ $product->surface->name }}</x-ui.badge>
                        @endif

                        <span class="text-caption text-text-muted">
                            {{ __('product.code') }}:
                            <x-ui.measure :value="$product->code" dir="ltr" />
                        </span>
                    </div>

                    <h1 class="text-h1 text-balance">{{ $product->name }}</h1>

                    @if ($product->short_description)
                        <p class="text-lead text-text-secondary">{{ $product->short_description }}</p>
                    @endif
                </div>

                @if ($attributes !== [])
                    <dl class="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-6">
                        @foreach ($attributes as $attribute)
                            <div>
                                <dt class="text-caption text-text-muted">{{ $attribute['label'] }}</dt>
                                <dd class="mt-0.5 text-body-sm font-medium">{{ $attribute['value'] }}</dd>
                            </div>
                        @endforeach
                    </dl>
                @endif

                @if ($product->thicknesses->isNotEmpty())
                    <div>
                        <h2 class="mb-2 text-overline uppercase text-text-muted">{{ __('product.thicknesses') }}</h2>
                        <ul class="flex flex-wrap gap-2">
                            @foreach ($product->thicknesses as $thickness)
                                <li>
                                    <x-ui.badge>
                                        <x-ui.measure :value="$thickness->displayLabel()" />
                                    </x-ui.badge>
                                </li>
                            @endforeach
                        </ul>
                    </div>
                @endif

                @if ($product->dimensions->isNotEmpty())
                    <div>
                        <h2 class="mb-2 text-overline uppercase text-text-muted">{{ __('product.dimensions') }}</h2>
                        <ul class="flex flex-wrap gap-2">
                            @foreach ($product->dimensions as $dimension)
                                <li>
                                    <x-ui.badge>
                                        <x-ui.measure :value="$dimension->displayLabel()" />
                                    </x-ui.badge>
                                </li>
                            @endforeach
                        </ul>
                    </div>
                @endif

                @if ($product->applications->isNotEmpty())
                    <div>
                        <h2 class="mb-2 text-overline uppercase text-text-muted">{{ __('product.applications') }}</h2>
                        <ul class="flex flex-wrap gap-2">
                            @foreach ($product->applications as $application)
                                <li><x-ui.badge>{{ $application->name }}</x-ui.badge></li>
                            @endforeach
                        </ul>
                    </div>
                @endif

                <div class="mt-2 flex flex-wrap gap-3">
                    <x-ui.button
                        :href="lroute('contact', ['type' => 'quote', 'product' => $product->slug])"
                        size="lg"
                    >{{ __('cta.request_quote') }}</x-ui.button>

                    <x-ui.button
                        :href="lroute('contact', ['type' => 'sample', 'product' => $product->slug])"
                        size="lg"
                        variant="outline"
                    >{{ __('cta.request_sample') }}</x-ui.button>

                    @if ($product->hasDatasheet())
                        <x-ui.button
                            :href="$product->datasheet->url()"
                            size="lg"
                            variant="ghost"
                            download
                        >{{ __('cta.download_datasheet') }}</x-ui.button>
                    @endif
                </div>

                <x-product.compare-button :product="$product" class="self-start" />
            </div>
        </div>
    </x-layout.section>

    {{-- Description and specifications ------------------------------------ --}}
    <x-layout.section tone="subtle">
        <div class="grid gap-12 lg:grid-cols-2 lg:gap-16">
            @if ($product->description)
                <div>
                    <h2 class="mb-5 text-h3">{{ __('product.overview') }}</h2>
                    <x-content.prose>
                        {!! nl2br(e($product->description)) !!}
                    </x-content.prose>
                </div>
            @endif

            @if ($product->specifications->isNotEmpty())
                <div>
                    <h2 class="mb-5 text-h3">{{ __('product.specifications') }}</h2>
                    <x-product.specs-table :product="$product" />
                </div>
            @endif
        </div>
    </x-layout.section>

    {{-- Related products --------------------------------------------------- --}}
    @if ($related->isNotEmpty())
        <x-layout.section>
            <x-layout.section-header :heading="__('product.related')" class="mb-8" />
            <x-product.grid :products="$related" :priority-count="0" />
        </x-layout.section>
    @endif

    <x-content.cta-band
        :heading="__('pages.home.cta_heading')"
        :lead="__('pages.home.cta_lead')"
    >
        <x-ui.button :href="lroute('contact', ['type' => 'quote', 'product' => $product->slug])" size="lg">
            {{ __('cta.request_quote') }}
        </x-ui.button>
    </x-content.cta-band>

    {{-- Sticky mobile CTA: the primary action stays reachable while reading
         a long specification table. --}}
    <x-slot:stickyCta>
        <div class="sticky bottom-0 z-30 border-t border-border bg-surface-raised/95 p-3 backdrop-blur-sm lg:hidden">
            <x-layout.container class="flex gap-3 px-0">
                <x-ui.button
                    :href="lroute('contact', ['type' => 'quote', 'product' => $product->slug])"
                    class="flex-1"
                >{{ __('cta.request_quote') }}</x-ui.button>

                <x-ui.button
                    :href="lroute('contact', ['type' => 'sample', 'product' => $product->slug])"
                    variant="outline"
                    class="flex-1"
                >{{ __('cta.request_sample') }}</x-ui.button>
            </x-layout.container>
        </div>
    </x-slot:stickyCta>

    <x-product.compare-bar />
</x-layouts.app>
