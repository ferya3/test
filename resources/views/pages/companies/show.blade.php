@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('pages.companies.heading'), 'url' => lroute('companies.index')],
        ['label' => $company->name],
    ];

    $stats = array_values(array_filter([
        $company->founded_year
            ? ['label' => __('pages.companies.founded'), 'value' => (string) $company->founded_year]
            : null,
        $company->employees
            ? ['label' => __('pages.companies.employees'), 'value' => number_format($company->employees), 'unit' => __('units.people'), 'count' => true]
            : null,
        $company->site_area_sqm
            ? ['label' => __('pages.companies.site_area'), 'value' => number_format($company->site_area_sqm), 'unit' => __('units.sqm'), 'count' => true]
            : null,
        $company->capacity
            ? ['label' => __('pages.companies.capacity'), 'value' => $company->capacity, 'dir' => 'auto']
            : null,
    ]));

    $contact = array_values(array_filter([
        $company->location ? ['label' => __('pages.companies.location'), 'value' => $company->location] : null,
        $company->phone ? ['label' => __('admin.field.phone'), 'value' => $company->phone, 'href' => 'tel:'.preg_replace('/[^0-9+]/', '', $company->phone), 'ltr' => true] : null,
        $company->email ? ['label' => __('admin.field.email'), 'value' => $company->email, 'href' => 'mailto:'.$company->email, 'ltr' => true] : null,
    ]));

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="$company->name" :seo="$seo">
    <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

    <x-content.hero
        :media="$company->cover"
        :overline="$company->sector"
        :heading="$company->name"
        :lead="$company->tagline ?: $company->summary"
        :breadcrumbs="$breadcrumbs"
    />

    {{-- Everything below the hero carries the company's accent. --}}
    <div @if ($company->accentStyle()) style="{{ $company->accentStyle() }}" @endif>
        <span aria-hidden="true" class="company-rule block h-1 w-full"></span>

        @if ($stats !== [])
            <x-layout.section size="sm" tone="subtle">
                <x-content.stat-band :stats="$stats" data-motion="stagger" />
            </x-layout.section>
        @endif

        @if ($company->body || $company->summary || $contact !== [] || $company->logo || $company->website_url)
            <x-layout.section>
                <div class="grid gap-10 lg:grid-cols-[1fr_18rem] lg:gap-16">
                    <div data-motion="reveal">
                        @if ($company->body)
                            <x-content.prose>{!! nl2br(e($company->body)) !!}</x-content.prose>
                        @elseif ($company->summary)
                            <p class="text-body-lg text-text-muted">{{ $company->summary }}</p>
                        @endif
                    </div>

                    @if ($contact !== [] || $company->logo || $company->website_url)
                        <aside class="company-border flex flex-col gap-5 rounded-lg border border-s-4 p-6" data-motion="reveal">
                            @if ($company->logo)
                                <x-media.picture
                                    :media="$company->logo"
                                    :alt="$company->name"
                                    sizes="12rem"
                                    class="h-14 w-auto self-start"
                                    fit="contain"
                                />
                            @endif

                            @if ($contact !== [])
                                <dl class="flex flex-col gap-4">
                                    @foreach ($contact as $item)
                                        <div>
                                            <dt class="text-caption text-text-muted">{{ $item['label'] }}</dt>
                                            <dd class="mt-0.5 text-body font-medium">
                                                @isset($item['href'])
                                                    <a href="{{ $item['href'] }}" class="underline-offset-4 hover:underline">
                                                        <x-ui.measure :value="$item['value']" dir="ltr" :tabular="false" />
                                                    </a>
                                                @else
                                                    {{ $item['value'] }}
                                                @endisset
                                            </dd>
                                        </div>
                                    @endforeach
                                </dl>
                            @endif

                            @if ($company->website_url)
                                <x-ui.button :href="$company->website_url" variant="outline" rel="noopener" target="_blank">
                                    {{ __('cta.visit_website') }}
                                </x-ui.button>
                            @endif
                        </aside>
                    @endif
                </div>
            </x-layout.section>
        @endif

        @if ($products->isNotEmpty())
            <x-layout.section tone="subtle">
                <x-layout.section-header :heading="__('pages.companies.products_heading')" class="mb-8" data-motion="reveal" />
                <x-product.grid :products="$products" :priority-count="0" />
            </x-layout.section>
        @endif

        @if ($projects->isNotEmpty())
            <x-layout.section>
                <x-layout.section-header :heading="__('pages.companies.projects_heading')" class="mb-8" data-motion="reveal" />

                <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-motion="stagger">
                    @foreach ($projects as $project)
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
                                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                                    class="w-full"
                                />
                                <div class="flex flex-1 flex-col gap-2 p-6">
                                    <h3 id="project-{{ $project->id }}" class="text-h4">{{ $project->title }}</h3>
                                    @if ($project->summary)
                                        <p class="line-clamp-2 text-body-sm text-text-muted">{{ $project->summary }}</p>
                                    @endif
                                </div>
                            </x-ui.card>
                        </li>
                    @endforeach
                </ul>
            </x-layout.section>
        @endif

        @if ($certificates->isNotEmpty())
            <x-layout.section tone="subtle" size="sm">
                <x-layout.section-header :heading="__('pages.companies.certificates_heading')" class="mb-8" />

                <ul class="flex flex-wrap gap-3">
                    @foreach ($certificates as $certificate)
                        <li>
                            <a
                                href="{{ lroute('certificates') }}"
                                class="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-3 text-body-sm transition-colors hover:border-border-strong"
                            >
                                <span aria-hidden="true" class="company-rule size-2 rounded-full"></span>
                                {{ $certificate->title }}
                            </a>
                        </li>
                    @endforeach
                </ul>
            </x-layout.section>
        @endif

        @if ($articles->isNotEmpty())
            <x-layout.section>
                <x-layout.section-header :heading="__('pages.companies.articles_heading')" class="mb-8" data-motion="reveal" />

                <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-motion="stagger">
                    @foreach ($articles as $article)
                        <li class="flex">
                            <x-ui.card
                                :href="lroute('articles.show', ['article' => $article->slug])"
                                :labelledby="'article-'.$article->id"
                                padding="none"
                                class="w-full overflow-hidden"
                            >
                                <x-media.picture
                                    :media="$article->cover"
                                    :alt="$article->title"
                                    ratio="16/9"
                                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                                    class="w-full"
                                />
                                <div class="flex flex-1 flex-col gap-2 p-6">
                                    <h3 id="article-{{ $article->id }}" class="text-h4">{{ $article->title }}</h3>
                                    @if ($article->excerpt)
                                        <p class="line-clamp-2 text-body-sm text-text-muted">{{ $article->excerpt }}</p>
                                    @endif
                                </div>
                            </x-ui.card>
                        </li>
                    @endforeach
                </ul>
            </x-layout.section>
        @endif
    </div>

    @if ($siblings->isNotEmpty())
        <x-layout.section tone="subtle">
            <x-layout.section-header :heading="__('pages.companies.siblings_heading')" class="mb-8" data-motion="reveal" />

            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-motion="stagger">
                @foreach ($siblings as $sibling)
                    <li class="flex">
                        <x-company.card :company="$sibling" />
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif

    <x-content.cta-band :heading="__('pages.companies.contact')" :lead="$company->summary">
        <x-ui.button :href="lroute('contact')" size="lg">{{ __('cta.contact_factory') }}</x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
