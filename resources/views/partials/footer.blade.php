@php
    /** @var \App\Services\Localization\LocaleManager $locales */
    $locales = app(\App\Services\Localization\LocaleManager::class);
    $groups = config('navigation.footer', []);
@endphp

<footer class="border-t border-border bg-surface-subtle">
    <x-layout.container class="py-section-sm">
        <div class="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div class="flex flex-col gap-4">
                <p class="text-body font-bold tracking-tight">{{ config('app.name') }}</p>
                <p class="max-w-xs text-body-sm text-text-muted">{{ __('footer.tagline') }}</p>
            </div>

            @foreach ($groups as $group => $links)
                <nav aria-labelledby="footer-{{ $group }}">
                    <h2 id="footer-{{ $group }}" class="mb-4 text-overline uppercase text-text-muted">
                        {{ __("footer.group.{$group}") }}
                    </h2>
                    <ul class="flex flex-col gap-2.5">
                        @foreach ($links as $link)
                            <li>
                                <a
                                    href="{{ $locales->url($link['path']) }}"
                                    class="rounded-xs text-body-sm text-text-secondary underline-offset-4 transition-colors hover:text-text hover:underline"
                                >{{ __($link['label']) }}</a>
                            </li>
                        @endforeach
                    </ul>
                </nav>
            @endforeach
        </div>

        <div class="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-caption text-text-muted">
                {{ __('footer.copyright', ['year' => now()->year, 'name' => config('app.name')]) }}
            </p>
            <x-layout.language-switcher />
        </div>
    </x-layout.container>
</footer>
