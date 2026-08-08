<x-layouts.admin :title="__('admin.resources.catalog_requests')">
    <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full text-body-sm">
            <thead class="border-b border-border bg-surface-subtle">
                <tr>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('contact.field.name') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('contact.field.phone') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('nav.catalog') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.received') }}</th>
                    <th scope="col" class="px-4 py-3 text-end font-semibold">{{ __('admin.field.status') }}</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($requests as $request)
                    <tr class="border-b border-border last:border-0">
                        <td class="px-4 py-3">{{ $request->name }}</td>
                        <td class="px-4 py-3"><x-ui.measure :value="$request->phone" dir="ltr" /></td>
                        <td class="px-4 py-3">{{ $request->catalog?->title ?? '—' }}</td>
                        <td class="px-4 py-3"><x-ui.measure :value="$request->created_at->format('Y-m-d')" dir="ltr" /></td>
                        <td class="px-4 py-3 text-end">
                            @can('update', $request)
                                <form method="POST" action="{{ route('admin.catalog-requests.update', $request) }}" class="inline-flex items-center gap-2" x-data>
                                    @csrf
                                    @method('PUT')
                                    <label for="status-{{ $request->id }}" class="sr-only">{{ __('admin.field.status') }}</label>
                                    <select
                                        id="status-{{ $request->id }}"
                                        name="status"
                                        x-on:change="$el.form.requestSubmit()"
                                        class="h-9 rounded-md border border-border-strong bg-surface-raised ps-2.5 pe-8 text-caption"
                                    >
                                        @foreach (App\Support\Enums\LeadStatus::cases() as $status)
                                            <option value="{{ $status->value }}" @selected($request->status === $status)>{{ $status->label() }}</option>
                                        @endforeach
                                    </select>
                                    <noscript><button type="submit" class="text-caption underline">{{ __('admin.save') }}</button></noscript>
                                </form>
                            @else
                                {{ $request->status->label() }}
                            @endcan
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="5" class="px-4 py-12 text-center text-text-muted">{{ __('admin.empty') }}</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-6">{{ $requests->links() }}</div>
</x-layouts.admin>
