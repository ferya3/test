@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.certificates')],
    ];
@endphp

<x-layouts.app :title="__('pages.certificates.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-layout.section-header
            :heading="__('pages.certificates.heading')"
            :lead="__('pages.certificates.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            @foreach ($certificates as $index => $certificate)
                <li>
                    <x-ui.card padding="none" class="h-full overflow-hidden">
                        <x-media.picture
                            :media="$certificate->image"
                            :alt="$certificate->title"
                            ratio="3/4"
                            :priority="$index < 3"
                            sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 92vw"
                            class="w-full"
                        />

                        <div class="flex flex-1 flex-col gap-3 p-6">
                            <div class="flex items-start justify-between gap-2">
                                <h2 class="text-h4">{{ $certificate->title }}</h2>

                                @if ($certificate->hasExpired())
                                    <x-ui.badge tone="warning" size="sm">
                                        {{ __('pages.certificates.expired') }}
                                    </x-ui.badge>
                                @endif
                            </div>

                            @if ($certificate->issuer)
                                <p class="text-body-sm text-text-muted">
                                    {{ __('pages.certificates.issuer') }}: {{ $certificate->issuer }}
                                </p>
                            @endif

                            <dl class="mt-auto flex flex-col gap-1.5 border-t border-border pt-4 text-caption">
                                @if ($certificate->certificate_number)
                                    <div class="flex justify-between gap-3">
                                        <dt class="text-text-muted">{{ __('pages.certificates.number') }}</dt>
                                        <dd><x-ui.measure :value="$certificate->certificate_number" dir="ltr" /></dd>
                                    </div>
                                @endif

                                @if ($certificate->issued_at)
                                    <div class="flex justify-between gap-3">
                                        <dt class="text-text-muted">{{ __('pages.certificates.issued') }}</dt>
                                        <dd><x-ui.measure :value="$certificate->issued_at->format('Y-m-d')" dir="ltr" /></dd>
                                    </div>
                                @endif

                                <div class="flex justify-between gap-3">
                                    <dt class="text-text-muted">{{ __('pages.certificates.expires') }}</dt>
                                    <dd>
                                        @if ($certificate->expires_at)
                                            <x-ui.measure :value="$certificate->expires_at->format('Y-m-d')" dir="ltr" />
                                        @else
                                            {{ __('pages.certificates.no_expiry') }}
                                        @endif
                                    </dd>
                                </div>
                            </dl>

                            @if ($certificate->document)
                                <x-ui.button
                                    :href="$certificate->document->url()"
                                    variant="outline"
                                    size="sm"
                                    class="mt-2"
                                    download
                                >{{ __('cta.download_datasheet') }}</x-ui.button>
                            @endif
                        </div>
                    </x-ui.card>
                </li>
            @endforeach
        </ul>
    </x-layout.section>
</x-layouts.app>
