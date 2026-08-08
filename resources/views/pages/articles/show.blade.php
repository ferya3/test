@php
    $breadcrumbs = array_values(array_filter([
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.articles'), 'url' => lroute('articles.index')],
        $article->category
            ? ['label' => $article->category->name, 'url' => lroute('articles.index', ['category' => $article->category->slug])]
            : null,
        ['label' => $article->title],
    ]));

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="$article->title" :seo="$seo">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

        <article>
            <header class="flex max-w-content flex-col gap-4">
                <div class="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                    @if ($article->category)
                        <span class="text-accent-text">{{ $article->category->name }}</span>
                        <span aria-hidden="true">·</span>
                    @endif

                    @if ($article->published_at)
                        <time datetime="{{ $article->published_at->toDateString() }}">
                            <x-ui.measure :value="$article->published_at->format('Y-m-d')" dir="ltr" />
                        </time>
                    @endif

                    @if ($article->reading_time)
                        <span aria-hidden="true">·</span>
                        <span>{{ __('pages.articles.reading_time', ['count' => $article->reading_time]) }}</span>
                    @endif
                </div>

                <h1 class="text-h1 text-balance">{{ $article->title }}</h1>

                @if ($article->excerpt)
                    <p class="text-lead text-text-secondary">{{ $article->excerpt }}</p>
                @endif
            </header>
        </article>
    </x-layout.section>

    @if ($article->cover)
        <x-layout.container class="-mt-4">
            <x-media.picture
                :media="$article->cover"
                :alt="$article->title"
                ratio="16/9"
                priority
                sizes="(min-width: 1280px) 80rem, 100vw"
                class="w-full rounded-lg"
            />
        </x-layout.container>
    @endif

    <x-layout.section>
        {{-- Body copy is editor-authored plain text; newlines become paragraphs
             and the content is escaped before nl2br runs. --}}
        <x-content.prose>{!! nl2br(e($article->body)) !!}</x-content.prose>
    </x-layout.section>

    @if ($related->isNotEmpty())
        <x-layout.section tone="subtle">
            <x-layout.section-header :heading="__('pages.articles.related')" class="mb-8" />

            <ul class="grid gap-6 md:grid-cols-3">
                @foreach ($related as $item)
                    <li class="flex">
                        <x-ui.card
                            :href="lroute('articles.show', ['article' => $item->slug])"
                            :labelledby="'rel-article-'.$item->id"
                            padding="none"
                            class="w-full overflow-hidden"
                        >
                            <x-media.picture
                                :media="$item->cover"
                                :alt="$item->title"
                                ratio="16/9"
                                sizes="(min-width: 768px) 30vw, 92vw"
                                class="w-full"
                            />
                            <div class="p-5">
                                <h3 id="rel-article-{{ $item->id }}" class="text-h4">{{ $item->title }}</h3>
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif
</x-layouts.app>
