@php
    use App\Support\Admin\Field;
@endphp

<x-layouts.admin :title="$title">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        @if ($searchable)
            <form method="GET" role="search" class="flex items-center gap-2">
                <label for="q" class="sr-only">{{ __('ui.search') }}</label>
                <input
                    id="q"
                    type="search"
                    name="q"
                    value="{{ request('q') }}"
                    placeholder="{{ __('ui.search') }}"
                    class="h-10 w-64 max-w-full rounded-md border border-border-strong bg-surface-raised px-3.5 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                <x-ui.button type="submit" variant="outline" size="sm">{{ __('ui.search') }}</x-ui.button>
            </form>
        @else
            <span></span>
        @endif

        @can('create', $records->getCollection()->first() ?? null)
            <x-ui.button :href="route('admin.'.$resource.'.create')">{{ __('admin.create') }}</x-ui.button>
        @endcan
    </div>

    <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full text-body-sm">
            <thead class="border-b border-border bg-surface-subtle">
                <tr>
                    @foreach ($fields as $field)
                        <th scope="col" class="px-4 py-3 text-start font-semibold">{{ $field->label }}</th>
                    @endforeach
                    <th scope="col" class="px-4 py-3 text-end font-semibold">{{ __('admin.actions') }}</th>
                </tr>
            </thead>

            <tbody>
                @forelse ($records as $record)
                    <tr class="border-b border-border last:border-0">
                        @foreach ($fields as $field)
                            <td class="px-4 py-3 align-top">
                                <x-admin.cell :record="$record" :field="$field" />
                            </td>
                        @endforeach

                        <td class="px-4 py-3 text-end whitespace-nowrap">
                            @can('update', $record)
                                <a
                                    href="{{ route('admin.'.$resource.'.edit', $record) }}"
                                    class="rounded-xs px-2 py-1 text-accent-text underline-offset-4 hover:underline"
                                >{{ __('admin.edit') }}</a>
                            @endcan

                            @can('delete', $record)
                                {{-- Confirmed with a native dialog rather than an
                                     inline handler, which the CSP would block. --}}
                                <form
                                    method="POST"
                                    action="{{ route('admin.'.$resource.'.destroy', $record) }}"
                                    class="inline"
                                    x-data
                                    x-on:submit="if (! confirm('{{ __('admin.confirm_delete') }}')) $event.preventDefault()"
                                >
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="rounded-xs px-2 py-1 text-danger-tint-text underline-offset-4 hover:underline">
                                        {{ __('admin.delete') }}
                                    </button>
                                </form>
                            @endcan
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="{{ count($fields) + 1 }}" class="px-4 py-12 text-center text-text-muted">
                            {{ __('admin.empty') }}
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-6">{{ $records->links() }}</div>
</x-layouts.admin>
