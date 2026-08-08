<x-layouts.admin-auth :title="__('admin.two_factor.recovery_title')">
    <x-slot:subtitle>{{ __('admin.two_factor.recovery_intro') }}</x-slot:subtitle>

    <x-ui.alert tone="warning" class="mb-5">{{ __('admin.two_factor.recovery_warning') }}</x-ui.alert>

    <ul class="mb-6 grid grid-cols-2 gap-2 rounded-md bg-surface-subtle p-4">
        @foreach ($recoveryCodes as $code)
            <li class="text-center"><x-ui.measure :value="$code" dir="ltr" /></li>
        @endforeach
    </ul>

    <x-ui.button :href="route('admin.dashboard')" size="lg" full-width>
        {{ __('admin.two_factor.stored_codes') }}
    </x-ui.button>
</x-layouts.admin-auth>
