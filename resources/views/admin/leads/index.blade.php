<x-layouts.admin :title="__('admin.resources.leads')">
    <div class="mb-6 flex flex-wrap gap-2">
        <a href="{{ route('admin.leads.index') }}"
           @class(['rounded-sm border px-3.5 py-2 text-body-sm transition-colors',
                   'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeType === null && $activeStatus === null,
                   'border-border hover:border-border-strong' => $activeType !== null || $activeStatus !== null])
        >{{ __('admin.all') }}</a>

        @foreach ($types as $type)
            <a href="{{ route('admin.leads.index', ['type' => $type->value]) }}"
               @class(['rounded-sm border px-3.5 py-2 text-body-sm transition-colors',
                       'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeType === $type,
                       'border-border hover:border-border-strong' => $activeType !== $type])
            >{{ $type->label() }}</a>
        @endforeach

        @foreach ($statuses as $status)
            <a href="{{ route('admin.leads.index', ['status' => $status->value]) }}"
               @class(['rounded-sm px-3 py-2 text-caption transition-colors',
                       'bg-surface-subtle text-text' => $activeStatus === $status,
                       'text-text-muted hover:text-text' => $activeStatus !== $status])
            >{{ $status->label() }}</a>
        @endforeach
    </div>

    <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full text-body-sm">
            <thead class="border-b border-border bg-surface-subtle">
                <tr>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('contact.field.name') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('contact.field.type') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('contact.field.phone') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.status') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.received') }}</th>
                    <th scope="col" class="px-4 py-3 text-end font-semibold">{{ __('admin.actions') }}</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($leads as $lead)
                    <tr class="border-b border-border last:border-0">
                        <td class="px-4 py-3">{{ $lead->name }}</td>
                        <td class="px-4 py-3">{{ $lead->type->label() }}</td>
                        <td class="px-4 py-3"><x-ui.measure :value="$lead->phone" dir="ltr" /></td>
                        <td class="px-4 py-3">
                            <x-ui.badge :tone="$lead->status->value === 'new' ? 'accent' : 'neutral'" size="sm">
                                {{ $lead->status->label() }}
                            </x-ui.badge>
                        </td>
                        <td class="px-4 py-3"><x-ui.measure :value="$lead->created_at->format('Y-m-d')" dir="ltr" /></td>
                        <td class="px-4 py-3 text-end">
                            <a href="{{ route('admin.leads.show', $lead) }}" class="text-accent-text underline-offset-4 hover:underline">
                                {{ __('admin.view') }}
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="6" class="px-4 py-12 text-center text-text-muted">{{ __('admin.empty') }}</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-6">{{ $leads->links() }}</div>
</x-layouts.admin>
