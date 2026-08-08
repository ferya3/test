<x-layouts.admin-auth :title="__('admin.sign_in')">
    <form method="POST" action="{{ route('admin.login.store') }}" class="flex flex-col gap-5">
        @csrf

        <x-ui.input
            name="email"
            type="email"
            :label="__('admin.field.email')"
            required
            autocomplete="username"
            autofocus
        />

        <x-ui.input
            name="password"
            type="password"
            :label="__('admin.field.password')"
            required
            autocomplete="current-password"
        />

        <x-ui.checkbox name="remember" value="1" :label="__('admin.remember_me')" />

        <x-ui.button type="submit" size="lg" full-width>{{ __('admin.sign_in') }}</x-ui.button>
    </form>
</x-layouts.admin-auth>
