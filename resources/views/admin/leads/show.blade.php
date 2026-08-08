<x-layouts.admin :title="$lead->name">
    <a href="{{ route('admin.leads.index') }}" class="mb-6 inline-block text-body-sm text-accent-text underline-offset-4 hover:underline">
        ← {{ __('admin.resources.leads') }}
    </a>

    <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div class="rounded-lg border border-border bg-surface p-6">
            <dl class="grid gap-5 sm:grid-cols-2">
                @foreach ([
                    __('contact.field.name') => $lead->name,
                    __('contact.field.type') => $lead->type->label(),
                    __('contact.field.phone') => $lead->phone,
                    __('contact.field.email') => $lead->email,
                    __('contact.field.company') => $lead->company,
                    __('contact.field.province') => $lead->province,
                    __('contact.field.city') => $lead->city,
                    __('contact.field.subject') => $lead->subject,
                ] as $label => $value)
                    @continue(blank($value))
                    <div>
                        <dt class="text-caption text-text-muted">{{ $label }}</dt>
                        <dd class="mt-0.5">{{ $value }}</dd>
                    </div>
                @endforeach
            </dl>

            <div class="mt-6 border-t border-border pt-5">
                <h2 class="mb-2 text-caption text-text-muted">{{ __('contact.field.message') }}</h2>
                <p class="whitespace-pre-line">{{ $lead->message }}</p>
            </div>

            @if ($lead->product)
                <div class="mt-6 border-t border-border pt-5">
                    <h2 class="mb-2 text-caption text-text-muted">{{ __('admin.field.about_product') }}</h2>
                    <a href="{{ lroute('products.show', ['product' => $lead->product->slug]) }}" target="_blank" rel="noopener"
                       class="text-accent-text underline-offset-4 hover:underline">{{ $lead->product->name }}</a>
                </div>
            @endif
        </div>

        <aside class="flex flex-col gap-4">
            @can('update', $lead)
                <form method="POST" action="{{ route('admin.leads.update', $lead) }}" class="rounded-lg border border-border bg-surface p-5">
                    @csrf
                    @method('PUT')

                    <x-ui.select
                        name="status"
                        :label="__('admin.field.status')"
                        :options="collect(App\Support\Enums\LeadStatus::cases())->mapWithKeys(fn ($s) => [$s->value => $s->label()])->all()"
                        :selected="$lead->status->value"
                    />

                    <x-ui.button type="submit" full-width class="mt-4">{{ __('admin.save') }}</x-ui.button>
                </form>
            @endcan

            <div class="rounded-lg border border-border bg-surface p-5 text-body-sm">
                <dl class="flex flex-col gap-3">
                    <div>
                        <dt class="text-caption text-text-muted">{{ __('admin.field.received') }}</dt>
                        <dd><x-ui.measure :value="$lead->created_at->format('Y-m-d H:i')" dir="ltr" /></dd>
                    </div>
                    @if ($lead->handler)
                        <div>
                            <dt class="text-caption text-text-muted">{{ __('admin.field.handled_by') }}</dt>
                            <dd>{{ $lead->handler->name }}</dd>
                        </div>
                    @endif
                    <div>
                        <dt class="text-caption text-text-muted">IP</dt>
                        <dd><x-ui.measure :value="$lead->ip_address ?? '—'" dir="ltr" /></dd>
                    </div>
                </dl>
            </div>
        </aside>
    </div>
</x-layouts.admin>
