@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.articles')],
    ];
@endphp

<x-layouts.app :title="__('pages.articles.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-layout.section-header
            :heading="__('pages.articles.heading')"
            :lead="__('pages.articles.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <ul class="mb-8 flex flex-wrap gap-2 border-b border-border pb-6">
            <li>
                <a href="{{ lroute('articles.index') }}"
                   @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                           'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeCategory === null,
                           'border-border hover:border-border-strong' => $activeCategory !== null])
                >{{ __('pages.articles.all_categories') }}</a>
            </li>
            @foreach ($categories as $category)
                <li>
                    <a href="{{ lroute('articles.index', ['category' => $category->slug]) }}"
                       @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                               'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeCategory === $category->slug,
                               'border-border hover:border-border-strong' => $activeCategory !== $category->slug])
                    >{{ $category->name }}</a>
                </li>
            @endforeach
        </ul>

        @if ($articles->isEmpty())
            <x-ui.empty-state :heading="__('ui.no_results')" />
        @else
            <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                @foreach ($articles as $index => $article)
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
                                :priority="$index < 3"
                                sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 92vw"
                                class="w-full"
                            />

                            <div class="flex flex-1 flex-col gap-2 p-6">
                                <div class="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                                    @if ($article->category)
                                        <span class="text-accent-text">{{ $article->category->name }}</span>
                                    @endif
                                    @if ($article->reading_time)
                                        <span aria-hidden="true">·</span>
                                        <span>{{ __('pages.articles.reading_time', ['count' => $article->reading_time]) }}</span>
                                    @endif
                                </div>

                                <h2 id="article-{{ $article->id }}" class="text-h4 text-balance">{{ $article->title }}</h2>

                                @if ($article->excerpt)
                                    <p class="line-clamp-3 text-body-sm text-text-muted">{{ $article->excerpt }}</p>
                                @endif
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>

            {{ $articles->links() }}
        @endif
    </x-layout.section>
</x-layouts.app>
