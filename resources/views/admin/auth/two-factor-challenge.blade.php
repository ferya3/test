<x-layouts.admin-auth :title="__('admin.two_factor.challenge_title')">
    <x-slot:subtitle>{{ __('admin.two_factor.challenge_intro') }}</x-slot:subtitle>

    <form method="POST" action="{{ route('admin.two-factor.challenge.store') }}" class="flex flex-col gap-5">
        @csrf

        <x-ui.input
            name="code"
            :label="__('admin.two_factor.code')"
            autocomplete="one-time-code"
            inputmode="numeric"
            autofocus
        />

        <details class="text-body-sm">
            <summary class="cursor-pointer text-accent-text">{{ __('admin.two_factor.use_recovery') }}</summary>
            <div class="mt-3">
                <x-ui.input
                    name="recovery_code"
                    :label="__('admin.two_factor.recovery_code')"
                    :hint="__('admin.two_factor.recovery_hint')"
                    autocomplete="off"
                />
            </div>
        </details>

        <x-ui.button type="submit" size="lg" full-width>{{ __('admin.two_factor.verify') }}</x-ui.button>
    </form>
</x-layouts.admin-auth>
