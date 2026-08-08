@php
    /** @var \App\Services\Localization\LocaleManager $locales */
    $locales = app(\App\Services\Localization\LocaleManager::class);
    $primary = config('navigation.primary', []);
    $currentPath = '/'.ltrim(str_replace($locales->prefix(), '', request()->path()), '/');
@endphp

<header
    x-data="{ open: false }"
    class="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-sm"
>
    <x-layout.container class="flex h-16 items-center gap-6 lg:h-20">
        {{-- Wordmark. Text rather than an image so it stays crisp and needs no
             extra request; the factory logo replaces this in production. --}}
        <a
            href="{{ $locales->url('/') }}"
            class="flex shrink-0 items-center gap-2.5 rounded-sm"
            aria-label="{{ __('ui.home') }}"
        >
            <span aria-hidden="true" class="grid size-9 place-items-center rounded-sm bg-surface-inverse">
                <span class="text-body-sm font-bold text-text-inverse">آ</span>
            </span>
            <span class="text-body font-bold tracking-tight">{{ config('app.name') }}</span>
        </a>

        {{-- Desktop navigation --}}
        <nav aria-label="{{ __('ui.primary_navigation') }}" class="hidden flex-1 lg:block">
            <ul class="flex items-center gap-1">
                @foreach ($primary as $index => $item)
                    <li @if (! empty($item['children'])) x-data="{ expanded: false }" @endif class="relative">
                        @if (empty($item['children']))
                            <a
                                href="{{ $locales->url($item['path']) }}"
                                @if ($currentPath === $item['path']) aria-current="page" @endif
                                @class([
                                    'inline-flex h-10 items-center rounded-sm px-3 text-body-sm font-medium transition-colors',
                                    'text-text' => $currentPath === $item['path'],
                                    'text-text-secondary hover:text-text' => $currentPath !== $item['path'],
                                ])
                            >{{ __($item['label']) }}</a>
                        @else
                            {{-- Disclosure, not hover-only: keyboard and touch
                                 users need an explicit toggle. --}}
                            <button
                                type="button"
                                x-on:click="expanded = ! expanded"
                                x-on:keydown.escape="expanded = false"
                                x-bind:aria-expanded="expanded"
                                aria-controls="nav-panel-{{ $index }}"
                                class="inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-body-sm font-medium text-text-secondary transition-colors hover:text-text"
                            >
                                {{ __($item['label']) }}
                                <svg class="size-3.5 transition-transform" x-bind:class="expanded && '-rotate-180'" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                            </button>

                            <ul
                                id="nav-panel-{{ $index }}"
                                x-show="expanded"
                                x-cloak
                                x-transition.opacity.duration.150ms
                                x-on:click.outside="expanded = false"
                                class="absolute top-full start-0 mt-1 min-w-56 rounded-md border border-border bg-surface-raised p-1.5 shadow-md"
                            >
                                <li>
                                    <a href="{{ $locales->url($item['path']) }}" class="block rounded-sm px-3 py-2 text-body-sm font-medium transition-colors hover:bg-surface-subtle">
                                        {{ __($item['label']) }}
                                    </a>
                                </li>
                                @foreach ($item['children'] as $child)
                                    <li>
                                        <a href="{{ $locales->url($child['path']) }}" class="block rounded-sm px-3 py-2 text-body-sm text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text">
                                            {{ __($child['label']) }}
                                        </a>
                                    </li>
                                @endforeach
                            </ul>
                        @endif
                    </li>
                @endforeach
            </ul>
        </nav>

        <div class="ms-auto flex items-center gap-1 lg:ms-0">
            <x-layout.theme-toggle />

            {{--
                Visibility is controlled by a wrapper, never by passing display
                utilities into these components.

                $attributes->class() merges the caller's classes with the
                component's own, so `class="hidden sm:flex"` on a component that
                already sets `flex` emits both — and which one wins depends on
                their order in the compiled stylesheet, not on the markup. That
                left the switcher visible on mobile and pushed the header 9px
                past the viewport in LTR.
            --}}
            <div class="hidden sm:block">
                <x-layout.language-switcher />
            </div>

            <div class="hidden lg:block">
                <x-ui.button :href="$locales->url('/catalog')" size="sm">
                    {{ __('cta.download_catalog') }}
                </x-ui.button>
            </div>

            {{-- Mobile menu trigger --}}
            <button
                type="button"
                x-on:click="open = true"
                x-bind:aria-expanded="open"
                aria-controls="mobile-nav"
                class="inline-flex size-10 items-center justify-center rounded-md text-text lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                <span class="sr-only">{{ __('ui.open_menu') }}</span>
                <svg class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
            </button>
        </div>
    </x-layout.container>

    {{-- Mobile drawer. x-trap keeps focus inside while open, and Escape closes. --}}
    <div
        id="mobile-nav"
        x-show="open"
        x-cloak
        class="fixed inset-0 z-50 lg:hidden"
        x-on:keydown.escape.window="open = false"
    >
        <div
            x-show="open"
            x-transition.opacity
            class="absolute inset-0 bg-black/50"
            x-on:click="open = false"
            aria-hidden="true"
        ></div>

        <div
            x-show="open"
            x-trap.noscroll="open"
            x-transition
            role="dialog"
            aria-modal="true"
            aria-label="{{ __('ui.primary_navigation') }}"
            class="absolute inset-y-0 end-0 flex w-[min(20rem,88vw)] flex-col overflow-y-auto bg-surface p-5"
        >
            <div class="mb-4 flex items-center justify-between">
                <x-layout.language-switcher />

                <button
                    type="button"
                    x-on:click="open = false"
                    class="inline-flex size-10 items-center justify-center rounded-md text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    <span class="sr-only">{{ __('ui.close_menu') }}</span>
                    <svg class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                </button>
            </div>

            <nav class="flex-1">
                <ul class="flex flex-col gap-1">
                    @foreach ($primary as $item)
                        <li>
                            <a
                                href="{{ $locales->url($item['path']) }}"
                                @if ($currentPath === $item['path']) aria-current="page" @endif
                                class="block rounded-sm px-3 py-3 text-body font-medium transition-colors hover:bg-surface-subtle"
                            >{{ __($item['label']) }}</a>

                            @if (! empty($item['children']))
                                <ul class="ms-3 border-s border-border ps-3">
                                    @foreach ($item['children'] as $child)
                                        <li>
                                            <a
                                                href="{{ $locales->url($child['path']) }}"
                                                class="block rounded-sm px-3 py-2.5 text-body-sm text-text-secondary transition-colors hover:text-text"
                                            >{{ __($child['label']) }}</a>
                                        </li>
                                    @endforeach
                                </ul>
                            @endif
                        </li>
                    @endforeach
                </ul>
            </nav>

            <x-ui.button :href="$locales->url('/contact')" full-width class="mt-4">
                {{ __('cta.contact_factory') }}
            </x-ui.button>
        </div>
    </div>
</header>
