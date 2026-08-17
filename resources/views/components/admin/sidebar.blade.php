@php
    /**
     * Navigation is filtered by policy, so a role never sees a link it would be
     * refused at. The permission check is the same one the controller runs.
     */
    $groups = [
        __('admin.group.catalog') => [
            ['label' => __('admin.resources.products'), 'route' => 'admin.products.index', 'model' => App\Models\Product::class],
            ['label' => __('admin.resources.categories'), 'route' => 'admin.categories.index', 'model' => App\Models\Category::class],
            ['label' => __('admin.resources.colors'), 'route' => 'admin.colors.index', 'model' => App\Models\Color::class],
            ['label' => __('admin.resources.decors'), 'route' => 'admin.decors.index', 'model' => App\Models\Decor::class],
            ['label' => __('admin.resources.materials'), 'route' => 'admin.materials.index', 'model' => App\Models\Material::class],
            ['label' => __('admin.resources.surfaces'), 'route' => 'admin.surfaces.index', 'model' => App\Models\Surface::class],
            ['label' => __('admin.resources.applications'), 'route' => 'admin.applications.index', 'model' => App\Models\Application::class],
            ['label' => __('admin.resources.thicknesses'), 'route' => 'admin.thicknesses.index', 'model' => App\Models\Thickness::class],
        ],
        __('admin.group.content') => [
            ['label' => __('admin.resources.pages'), 'route' => 'admin.pages.index', 'model' => App\Models\Page::class],
            ['label' => __('admin.resources.articles'), 'route' => 'admin.articles.index', 'model' => App\Models\Article::class],
            ['label' => __('admin.resources.article_categories'), 'route' => 'admin.article-categories.index', 'model' => App\Models\ArticleCategory::class],
            ['label' => __('admin.resources.projects'), 'route' => 'admin.projects.index', 'model' => App\Models\Project::class],
            ['label' => __('admin.resources.certificates'), 'route' => 'admin.certificates.index', 'model' => App\Models\Certificate::class],
            ['label' => __('admin.resources.catalogs'), 'route' => 'admin.catalogs.index', 'model' => App\Models\Catalog::class],
            ['label' => __('admin.resources.representatives'), 'route' => 'admin.representatives.index', 'model' => App\Models\Representative::class],
            ['label' => __('admin.resources.media'), 'route' => 'admin.media.index', 'model' => App\Models\Media::class],
            // Sits beside the library rather than inside it: the library is
            // every file uploaded, this is the handful of places on the site
            // that show one.
            ['label' => __('admin.resources.site_images'), 'route' => 'admin.site-images.index', 'model' => App\Models\Media::class],
        ],
        __('admin.group.leads') => [
            ['label' => __('admin.resources.leads'), 'route' => 'admin.leads.index', 'model' => App\Models\ContactRequest::class],
            ['label' => __('admin.resources.catalog_requests'), 'route' => 'admin.catalog-requests.index', 'model' => App\Models\CatalogRequest::class],
        ],
        __('admin.group.administration') => [
            ['label' => __('admin.resources.users'), 'route' => 'admin.users.index', 'model' => App\Models\User::class],
            ['label' => __('admin.resources.settings'), 'route' => 'admin.settings.index', 'model' => App\Models\Setting::class],
        ],
    ];
@endphp

<aside
    class="w-full shrink-0 border-b border-border bg-surface lg:h-dvh lg:w-64 lg:overflow-y-auto lg:border-e lg:border-b-0"
    x-bind:class="nav ? 'block' : 'hidden lg:block'"
>
    <div class="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span aria-hidden="true" class="grid size-8 place-items-center rounded-sm bg-surface-inverse">
            <span class="text-body-sm font-bold text-text-inverse">آ</span>
        </span>
        <span class="text-body-sm font-bold">{{ __('admin.panel') }}</span>
    </div>

    <nav aria-label="{{ __('admin.panel') }}" class="p-3">
        <a
            href="{{ route('admin.dashboard') }}"
            @class([
                'mb-1 block rounded-sm px-3 py-2 text-body-sm font-medium transition-colors',
                'bg-accent-tint text-accent-tint-text' => request()->routeIs('admin.dashboard'),
                'hover:bg-surface-subtle' => ! request()->routeIs('admin.dashboard'),
            ])
        >{{ __('admin.dashboard') }}</a>

        @foreach ($groups as $group => $items)
            @php
                $visible = array_values(array_filter(
                    $items,
                    fn (array $item): bool => auth()->user()?->can('viewAny', $item['model']) ?? false,
                ));
            @endphp

            @continue($visible === [])

            <p class="mt-5 mb-1.5 px-3 text-overline uppercase text-text-muted">{{ $group }}</p>

            <ul class="flex flex-col gap-0.5">
                @foreach ($visible as $item)
                    @php $active = request()->routeIs(str_replace('.index', '.*', $item['route'])); @endphp
                    <li>
                        <a
                            href="{{ route($item['route']) }}"
                            @if ($active) aria-current="page" @endif
                            @class([
                                'block rounded-sm px-3 py-2 text-body-sm transition-colors',
                                'bg-accent-tint font-medium text-accent-tint-text' => $active,
                                'text-text-secondary hover:bg-surface-subtle hover:text-text' => ! $active,
                            ])
                        >{{ $item['label'] }}</a>
                    </li>
                @endforeach
            </ul>
        @endforeach
    </nav>
</aside>
