<x-layouts.admin :title="__('admin.resources.users')">
    <div class="mb-6 flex justify-end">
        @can('create', App\Models\User::class)
            <x-ui.button :href="route('admin.users.create')">{{ __('admin.create') }}</x-ui.button>
        @endcan
    </div>

    <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full text-body-sm">
            <thead class="border-b border-border bg-surface-subtle">
                <tr>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.name') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.email') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.role') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.two_factor') }}</th>
                    <th scope="col" class="px-4 py-3 text-start font-semibold">{{ __('admin.field.active') }}</th>
                    <th scope="col" class="px-4 py-3 text-end font-semibold">{{ __('admin.actions') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($users as $user)
                    <tr class="border-b border-border last:border-0">
                        <td class="px-4 py-3">{{ $user->name }}</td>
                        <td class="px-4 py-3"><x-ui.measure :value="$user->email" dir="ltr" :tabular="false" /></td>
                        <td class="px-4 py-3">{{ $user->roles->pluck('name')->join('، ') ?: '—' }}</td>
                        <td class="px-4 py-3">
                            @if ($user->hasEnabledTwoFactor())
                                <x-ui.badge tone="success" size="sm">{{ __('admin.yes') }}</x-ui.badge>
                            @elseif ($user->requiresTwoFactor())
                                <x-ui.badge tone="warning" size="sm">{{ __('admin.two_factor.pending') }}</x-ui.badge>
                            @else
                                <x-ui.badge size="sm">{{ __('admin.no') }}</x-ui.badge>
                            @endif
                        </td>
                        <td class="px-4 py-3">
                            <x-ui.badge :tone="$user->is_active ? 'success' : 'danger'" size="sm">
                                {{ $user->is_active ? __('admin.yes') : __('admin.no') }}
                            </x-ui.badge>
                        </td>
                        <td class="px-4 py-3 text-end">
                            @can('update', $user)
                                <a href="{{ route('admin.users.edit', $user) }}" class="text-accent-text underline-offset-4 hover:underline">
                                    {{ __('admin.edit') }}
                                </a>
                            @endcan
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>

    <div class="mt-6">{{ $users->links() }}</div>
</x-layouts.admin>
