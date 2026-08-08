<x-layouts.app :title="config('app.name')" :seo="$seo">
    <x-content.hero
        :overline="__('pages.home.hero_overline')"
        :heading="__('pages.home.hero_heading')"
        :lead="__('pages.home.hero_lead')"
        size="lg"
    >
        <x-slot:actions>
            <x-ui.button :href="lroute('products.index')" size="lg">
                {{ __('cta.view_products') }}
            </x-ui.button>
            <x-ui.button :href="lroute('catalog.index')" size="lg" variant="outline" class="border-white/40 text-white hover:bg-white/10">
                {{ __('cta.download_catalog') }}
            </x-ui.button>
        </x-slot:actions>
    </x-content.hero>

    {{-- Product groups ------------------------------------------------- --}}
    @if ($categories->isNotEmpty())
        <x-layout.section>
            <x-layout.section-header
                :overline="__('nav.products')"
                :heading="__('pages.home.categories_heading')"
                :lead="__('pages.home.categories_lead')"
                class="mb-10"
            />

            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                @foreach ($categories as $category)
                    <li class="flex">
                        <x-ui.card
                            :href="lroute('categories.show', ['category' => $category->slug])"
                            :labelledby="'category-'.$category->id"
                            padding="none"
                            class="w-full overflow-hidden"
                        >
                            <x-media.picture
                                :media="$category->cover"
                                :alt="$category->name"
                                ratio="3/2"
                                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                                class="w-full"
                            />

                            <div class="flex flex-1 flex-col gap-2 p-6">
                                <h3 id="category-{{ $category->id }}" class="text-h4">{{ $category->name }}</h3>

                                @if ($category->short_description)
                                    <p class="text-body-sm text-text-muted">{{ $category->short_description }}</p>
                                @endif
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif

    {{-- Selected products ----------------------------------------------- --}}
    @if ($featuredProducts->isNotEmpty())
        <x-layout.section tone="subtle">
            <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
                <x-layout.section-header
                    :overline="__('nav.products')"
                    :heading="__('pages.home.featured_heading')"
                />

                <x-ui.button :href="lroute('products.index')" variant="outline">
                    {{ __('cta.view_all') }}
                </x-ui.button>
            </div>

            <x-product.grid :products="$featuredProducts" :priority-count="0" />
        </x-layout.section>
    @endif

    {{-- Projects --------------------------------------------------------- --}}
    @if ($featuredProjects->isNotEmpty())
        <x-layout.section>
            <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
                <x-layout.section-header
                    :overline="__('nav.projects')"
                    :heading="__('pages.home.projects_heading')"
                    :lead="__('pages.home.projects_lead')"
                />

                <x-ui.button :href="lroute('projects.index')" variant="outline">
                    {{ __('cta.view_all') }}
                </x-ui.button>
            </div>

            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                @foreach ($featuredProjects as $project)
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
                                <div class="flex items-center gap-2 text-caption text-text-muted">
                                    @if ($project->location)
                                        <span>{{ $project->location }}</span>
                                    @endif
                                    @if ($project->year)
                                        <span aria-hidden="true">·</span>
                                        <x-ui.measure :value="$project->year" dir="ltr" />
                                    @endif
                                </div>

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

    {{-- Certificates ----------------------------------------------------- --}}
    @if ($certificates->isNotEmpty())
        <x-layout.section tone="subtle" size="sm">
            <x-layout.section-header
                :heading="__('pages.home.certificates_heading')"
                :level="2"
                class="mb-8"
            />

            <ul class="flex flex-wrap gap-3">
                @foreach ($certificates as $certificate)
                    <li>
                        <a
                            href="{{ lroute('certificates') }}"
                            class="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-3 text-body-sm transition-colors hover:border-border-strong"
                        >
                            <svg class="size-4 text-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <circle cx="8" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5" />
                                <path d="M5.5 10 4.5 15l3.5-2 3.5 2-1-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                            </svg>
                            {{ $certificate->title }}
                        </a>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif

    {{-- Articles --------------------------------------------------------- --}}
    @if ($latestArticles->isNotEmpty())
        <x-layout.section>
            <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
                <x-layout.section-header
                    :overline="__('nav.articles')"
                    :heading="__('pages.home.articles_heading')"
                />

                <x-ui.button :href="lroute('articles.index')" variant="outline">
                    {{ __('cta.view_all') }}
                </x-ui.button>
            </div>

            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                @foreach ($latestArticles as $article)
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
                                @if ($article->category)
                                    <p class="text-caption text-accent-text">{{ $article->category->name }}</p>
                                @endif

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

    <x-content.cta-band
        :heading="__('pages.home.cta_heading')"
        :lead="__('pages.home.cta_lead')"
    >
        <x-ui.button :href="lroute('catalog.index')" size="lg">
            {{ __('cta.download_catalog') }}
        </x-ui.button>
        <x-ui.button
            :href="lroute('contact', ['type' => 'sample'])"
            size="lg"
            variant="outline"
            class="border-white/40 text-text-inverse hover:bg-white/10"
        >
            {{ __('cta.request_sample') }}
        </x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
