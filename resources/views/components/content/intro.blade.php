{{--
    The company introduction, directly below the homepage hero.

    Mobile first in the literal sense: the small-screen layout is the one
    written without a variant prefix — one column, text first, facts stacked
    underneath as a two-up grid that a thumb can read. The `lg:` rules only
    add the side rail once there is width to spare for it.
--}}
@props(['intro'])

<x-layout.section>
    <div class="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div class="lg:col-span-7">
            @if ($intro->overline)
                <p class="flex items-center gap-3 text-overline uppercase text-accent-text">
                    <span aria-hidden="true" class="h-px w-8 bg-accent"></span>
                    {{ $intro->overline }}
                </p>
            @endif

            @if ($intro->heading)
                <h2 class="mt-4 text-h2 text-balance">{{ $intro->heading }}</h2>
            @endif

            @if ($intro->paragraphs !== [])
                <div class="mt-6 flex flex-col gap-4">
                    @foreach ($intro->paragraphs as $paragraph)
                        <p class="text-lead text-text-secondary">{{ $paragraph }}</p>
                    @endforeach
                </div>
            @endif

            <div class="mt-8">
                <x-ui.button :href="lroute('about')" variant="outline">
                    {{ __('pages.home.intro_cta') }}
                </x-ui.button>
            </div>
        </div>

        @if ($intro->facts !== [])
            <div class="lg:col-span-5 lg:self-center">
                <dl class="grid grid-cols-2 gap-4 sm:gap-5">
                    @foreach ($intro->facts as $fact)
                        <div class="rounded-xl border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
                            <dt class="text-caption text-text-muted">{{ $fact['label'] }}</dt>
                            <dd class="mt-2 text-h3 text-accent-text">
                                <x-ui.measure :value="$fact['value']" />
                            </dd>
                        </div>
                    @endforeach
                </dl>
            </div>
        @endif
    </div>
</x-layout.section>
