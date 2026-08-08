@props(['title'])

<header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-sm lg:px-8">
    <button
        type="button"
        x-on:click="nav = ! nav"
        x-bind:aria-expanded="nav"
        class="inline-flex size-10 items-center justify-center rounded-md lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
        <span class="sr-only">{{ __('ui.open_menu') }}</span>
        <svg class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
    </button>

    <h1 class="flex-1 truncate text-h4">{{ $title }}</h1>

    <a
        href="{{ url('/') }}"
        target="_blank"
        rel="noopener"
        class="hidden rounded-sm px-3 py-2 text-body-sm text-text-muted transition-colors hover:text-text sm:inline-block"
    >{{ __('admin.view_site') }}</a>

    <x-layout.theme-toggle />

    <form method="POST" action="{{ route('admin.logout') }}">
        @csrf
        <x-ui.button type="submit" variant="ghost" size="sm">{{ __('admin.logout') }}</x-ui.button>
    </form>
</header>
