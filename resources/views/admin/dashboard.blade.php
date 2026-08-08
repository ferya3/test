<x-layouts.admin :title="__('admin.dashboard')">
    <dl class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @foreach ($stats as $stat)
            <div class="rounded-lg border border-border bg-surface p-5">
                <dt class="text-caption text-text-muted">{{ $stat['label'] }}</dt>
                <dd class="mt-1 text-h2 font-bold"><x-ui.measure :value="$stat['value']" dir="ltr" /></dd>
            </div>
        @endforeach
    </dl>

    <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-lg border border-border bg-surface">
            <h2 class="border-b border-border px-5 py-4 text-h4">{{ __('admin.recent_leads') }}</h2>

            @if ($recentLeads->isEmpty())
                <p class="px-5 py-10 text-center text-text-muted">{{ __('admin.no_open_leads') }}</p>
            @else
                <ul>
                    @foreach ($recentLeads as $lead)
                        <li class="border-b border-border last:border-0">
                            <a href="{{ route('admin.leads.show', $lead) }}" class="flex items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-subtle">
                                <span class="min-w-0">
                                    <span class="block truncate font-medium">{{ $lead->name }}</span>
                                    <span class="block text-caption text-text-muted">
                                        {{ $lead->type->label() }} ·
                                        <x-ui.measure :value="$lead->phone" dir="ltr" />
                                    </span>
                                </span>
                                <x-ui.badge :tone="$lead->status->value === 'new' ? 'accent' : 'neutral'" size="sm">
                                    {{ $lead->status->label() }}
                                </x-ui.badge>
                            </a>
                        </li>
                    @endforeach
                </ul>
            @endif
        </section>

        <div class="flex flex-col gap-6">
            @if ($leadsByType !== [])
                <section class="rounded-lg border border-border bg-surface p-5">
                    <h2 class="mb-4 text-h4">{{ __('admin.new_by_type') }}</h2>
                    <dl class="flex flex-col gap-2.5">
                        @foreach ($leadsByType as $label => $count)
                            <div class="flex items-center justify-between gap-3 text-body-sm">
                                <dt class="text-text-secondary">{{ $label }}</dt>
                                <dd class="font-semibold"><x-ui.measure :value="$count" dir="ltr" /></dd>
                            </div>
                        @endforeach
                    </dl>
                </section>
            @endif

            <section class="rounded-lg border border-border bg-surface">
                <h2 class="border-b border-border px-5 py-4 text-h4">{{ __('admin.resources.catalog_requests') }}</h2>

                @if ($recentCatalogRequests->isEmpty())
                    <p class="px-5 py-8 text-center text-text-muted">{{ __('admin.empty') }}</p>
                @else
                    <ul>
                        @foreach ($recentCatalogRequests as $request)
                            <li class="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0 text-body-sm">
                                <span class="min-w-0 truncate">{{ $request->name }}</span>
                                <span class="shrink-0 text-caption text-text-muted">{{ $request->catalog?->title }}</span>
                            </li>
                        @endforeach
                    </ul>
                @endif
            </section>
        </div>
    </div>
</x-layouts.admin>
