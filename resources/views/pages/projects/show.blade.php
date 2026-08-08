@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.projects'), 'url' => lroute('projects.index')],
        ['label' => $project->title],
    ];

    $facts = array_values(array_filter([
        $project->client ? ['label' => __('pages.projects.client'), 'value' => $project->client] : null,
        $project->location ? ['label' => __('pages.projects.location'), 'value' => $project->location] : null,
        $project->year ? ['label' => __('pages.projects.year'), 'value' => (string) $project->year, 'ltr' => true] : null,
        $project->area_sqm ? ['label' => __('pages.projects.area'), 'value' => number_format($project->area_sqm), 'unit' => __('units.sqm'), 'ltr' => true] : null,
    ]));

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="$project->title" :seo="$seo">
    <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

    <x-content.hero
        :media="$project->cover"
        :overline="$project->project_type?->label()"
        :heading="$project->title"
        :lead="$project->summary"
        :breadcrumbs="$breadcrumbs"
    />

    <x-layout.section>
        <div class="grid gap-10 lg:grid-cols-[1fr_18rem] lg:gap-16">
            <div>
                @if ($project->body)
                    <x-content.prose>{!! nl2br(e($project->body)) !!}</x-content.prose>
                @endif

                @if ($project->gallery->isNotEmpty())
                    <ul class="mt-10 grid gap-4 sm:grid-cols-2">
                        @foreach ($project->gallery as $image)
                            <li>
                                <x-media.picture
                                    :media="$image"
                                    :alt="$image->translate('alt') ?? $project->title"
                                    ratio="4/3"
                                    sizes="(min-width: 640px) 45vw, 92vw"
                                    class="w-full rounded-lg"
                                />
                            </li>
                        @endforeach
                    </ul>
                @endif
            </div>

            @if ($facts !== [])
                <aside>
                    <dl class="flex flex-col gap-4 rounded-lg border border-border p-6">
                        @foreach ($facts as $fact)
                            <div>
                                <dt class="text-caption text-text-muted">{{ $fact['label'] }}</dt>
                                <dd class="mt-0.5 text-body font-medium">
                                    @if (! empty($fact['ltr']))
                                        <x-ui.measure :value="$fact['value']" :unit="$fact['unit'] ?? null" dir="ltr" />
                                    @else
                                        {{ $fact['value'] }}
                                    @endif
                                </dd>
                            </div>
                        @endforeach
                    </dl>
                </aside>
            @endif
        </div>
    </x-layout.section>

    @if ($project->products->isNotEmpty())
        <x-layout.section tone="subtle">
            <x-layout.section-header :heading="__('pages.projects.products_used')" class="mb-8" />
            <x-product.grid :products="$project->products" :priority-count="0" />
        </x-layout.section>
    @endif

    @if ($related->isNotEmpty())
        <x-layout.section>
            <x-layout.section-header :heading="__('pages.projects.related')" class="mb-8" />

            <ul class="grid gap-6 md:grid-cols-3">
                @foreach ($related as $item)
                    <li class="flex">
                        <x-ui.card
                            :href="lroute('projects.show', ['project' => $item->slug])"
                            :labelledby="'related-'.$item->id"
                            padding="none"
                            class="w-full overflow-hidden"
                        >
                            <x-media.picture
                                :media="$item->cover"
                                :alt="$item->title"
                                ratio="4/3"
                                sizes="(min-width: 768px) 30vw, 92vw"
                                class="w-full"
                            />
                            <div class="p-5">
                                <h3 id="related-{{ $item->id }}" class="text-h4">{{ $item->title }}</h3>
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif
</x-layouts.app>
