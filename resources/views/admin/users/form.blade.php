@php
    $isNew = ! $user->exists;
@endphp

<x-layouts.admin :title="$isNew ? __('admin.create') : $user->name">
    <a href="{{ route('admin.users.index') }}" class="mb-6 inline-block text-body-sm text-accent-text underline-offset-4 hover:underline">
        ← {{ __('admin.resources.users') }}
    </a>

    <form method="POST" action="{{ $isNew ? route('admin.users.store') : route('admin.users.update', $user) }}" class="max-w-2xl">
        @csrf
        @unless ($isNew) @method('PUT') @endunless

        <div class="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6">
            <x-ui.input name="name" :label="__('admin.field.name')" :value="$user->name" required autocomplete="name" />
            <x-ui.input name="email" type="email" :label="__('admin.field.email')" :value="$user->email" required autocomplete="email" />

            <x-ui.input
                name="password"
                type="password"
                :label="__('admin.field.password')"
                :hint="$isNew ? __('admin.hint.password') : __('admin.hint.password_optional')"
                :required="$isNew"
                autocomplete="new-password"
            />
            <x-ui.input
                name="password_confirmation"
                type="password"
                :label="__('admin.field.password_confirmation')"
                :required="$isNew"
                autocomplete="new-password"
            />

            @php $isSelf = $user->exists && $user->is(auth()->user()); @endphp

            <x-ui.select
                name="role"
                :label="__('admin.field.role')"
                :options="collect($roles)->mapWithKeys(fn ($r) => [$r->value => $r->label()])->all()"
                :selected="$user->roles->first()?->name"
                :disabled="$isSelf"
                required
            />

            @if ($isSelf)
                {{-- Changing your own role or deactivating yourself would remove
                     the ability to undo it from inside the panel. --}}
                <x-ui.alert tone="info">{{ __('admin.cannot_change_own_role') }}</x-ui.alert>
            @else
                <input type="hidden" name="is_active" value="0">
                <x-ui.checkbox name="is_active" value="1" :label="__('admin.field.active')" :checked="$isNew || $user->is_active" />
            @endif
        </div>

        <div class="mt-6 flex flex-wrap gap-3">
            <x-ui.button type="submit" size="lg">{{ __('admin.save') }}</x-ui.button>
            <x-ui.button :href="route('admin.users.index')" variant="ghost" size="lg">{{ __('admin.cancel') }}</x-ui.button>
        </div>
    </form>

    @if ($user->exists && $user->hasEnabledTwoFactor())
        <form
            method="POST"
            action="{{ route('admin.users.reset-two-factor', $user) }}"
            class="mt-8 max-w-2xl rounded-lg border border-border bg-surface p-6"
            x-data
            x-on:submit="if (! confirm('{{ __('admin.two_factor.reset_confirm') }}')) $event.preventDefault()"
        >
            @csrf
            <h2 class="text-h4">{{ __('admin.two_factor.reset_title') }}</h2>
            <p class="mt-2 mb-4 text-body-sm text-text-muted">{{ __('admin.two_factor.reset_intro') }}</p>
            <x-ui.button type="submit" variant="danger">{{ __('admin.two_factor.reset') }}</x-ui.button>
        </form>
    @endif
</x-layouts.admin>
