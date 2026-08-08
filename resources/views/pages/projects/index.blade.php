@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.projects')],
    ];
    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="__('pages.projects.heading')" :seo="$seo">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />
        <x-layout.section-header
            :heading="__('pages.projects.heading')"
            :lead="__('pages.projects.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        {{-- Filters are links, so each combination is a shareable URL. --}}
        <div class="mb-8 flex flex-col gap-3 border-b border-border pb-6">
            <ul class="flex flex-wrap gap-2">
                <li>
                    <a href="{{ lroute('projects.index', array_filter(['year' => $activeYear])) }}"
                       @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                               'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeType === null,
                               'border-border hover:border-border-strong' => $activeType !== null])
                    >{{ __('pages.projects.all_types') }}</a>
                </li>
                @foreach ($types as $type)
                    <li>
                        <a href="{{ lroute('projects.index', array_filter(['type' => $type->value, 'year' => $activeYear])) }}"
                           @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                                   'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeType === $type->value,
                                   'border-border hover:border-border-strong' => $activeType !== $type->value])
                        >{{ $type->label() }}</a>
                    </li>
                @endforeach
            </ul>

            @if ($years !== [])
                <ul class="flex flex-wrap gap-2">
                    <li>
                        <a href="{{ lroute('projects.index', array_filter(['type' => $activeType])) }}"
                           @class(['inline-flex rounded-sm px-3 py-1.5 text-caption transition-colors',
                                   'bg-surface-subtle text-text' => $activeYear === null,
                                   'text-text-muted hover:text-text' => $activeYear !== null])
                        >{{ __('pages.projects.all_years') }}</a>
                    </li>
                    @foreach ($years as $year)
                        <li>
                            <a href="{{ lroute('projects.index', array_filter(['type' => $activeType, 'year' => $year])) }}"
                               @class(['inline-flex rounded-sm px-3 py-1.5 text-caption transition-colors',
                                       'bg-surface-subtle text-text' => $activeYear === $year,
                                       'text-text-muted hover:text-text' => $activeYear !== $year])
                            ><x-ui.measure :value="$year" dir="ltr" /></a>
                        </li>
                    @endforeach
                </ul>
            @endif
        </div>

        @if ($projects->isEmpty())
            <x-ui.empty-state :heading="__('ui.no_results')" />
        @else
            <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                @foreach ($projects as $index => $project)
                    <li class="flex">
                        <x-ui.card
                            :href="lroute('projects.show', ['project' => $project->slug])"
                            :labelledby="'project-'.$project->id"
                            padding="none"
                            class="w-full overflow-hidden"
                        >
                            <x-media.picture
                                :media="$project->cover"
                                :alt="$project->title"
                                ratio="4/3"
                                :priority="$index < 3"
                                sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 92vw"
                                class="w-full"
                            />

                            <div class="flex flex-1 flex-col gap-2 p-6">
                                <div class="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                                    @if ($project->project_type)
                                        <x-ui.badge tone="accent" size="sm">{{ $project->project_type->label() }}</x-ui.badge>
                                    @endif
                                    @if ($project->year)
                                        <x-ui.measure :value="$project->year" dir="ltr" />
                                    @endif
                                </div>

                                <h2 id="project-{{ $project->id }}" class="text-h4">{{ $project->title }}</h2>

                                @if ($project->summary)
                                    <p class="line-clamp-2 text-body-sm text-text-muted">{{ $project->summary }}</p>
                                @endif
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>

            {{ $projects->links() }}
        @endif
    </x-layout.section>
</x-layouts.app>
