@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.contact')],
    ];

    $settings = app(App\Services\SettingsRepository::class);
@endphp

<x-layouts.app :title="__('pages.contact.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-layout.section-header
            :heading="__('pages.contact.heading')"
            :lead="__('pages.contact.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <div class="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
            {{-- Form -------------------------------------------------------- --}}
            <div id="contact-form">
                @if (session('status'))
                    <x-ui.alert tone="success" class="mb-6">{{ session('status') }}</x-ui.alert>
                @endif

                @if ($errors->any())
                    <x-ui.alert tone="danger" class="mb-6" :title="__('contact.validation.spam')">
                        <ul class="list-inside list-disc">
                            @foreach ($errors->all() as $error)
                                <li>{{ $error }}</li>
                            @endforeach
                        </ul>
                    </x-ui.alert>
                @endif

                <h2 class="mb-6 text-h3">{{ __('contact.form_heading') }}</h2>

                <form method="POST" action="{{ lroute('contact.store') }}" class="grid gap-5 sm:grid-cols-2">
                    @csrf

                    {{-- Honeypot. Hidden from sight and from assistive technology,
                         and never focusable, so only a bot fills it in. --}}
                    <div class="hidden" aria-hidden="true">
                        <label for="website">Website</label>
                        <input id="website" type="text" name="website" tabindex="-1" autocomplete="off">
                    </div>

                    <x-ui.select
                        name="type"
                        :label="__('contact.field.type')"
                        :options="collect($types)->mapWithKeys(fn ($t) => [$t->value => $t->label()])->all()"
                        :selected="$activeType->value"
                        required
                        class="sm:col-span-2"
                    />

                    <x-ui.input name="name" :label="__('contact.field.name')" required autocomplete="name" />
                    <x-ui.input name="company" :label="__('contact.field.company')" optional-label autocomplete="organization" />

                    <x-ui.input
                        name="phone"
                        type="tel"
                        :label="__('contact.field.phone')"
                        :hint="__('contact.hint.phone')"
                        required
                        autocomplete="tel"
                        inputmode="tel"
                    />
                    <x-ui.input name="email" type="email" :label="__('contact.field.email')" optional-label autocomplete="email" />

                    <x-ui.select
                        name="province"
                        :label="__('contact.field.province')"
                        :placeholder="__('ui.optional')"
                        :options="collect($provinces)->mapWithKeys(fn ($p) => [$p => $p])->all()"
                    />
                    <x-ui.input name="city" :label="__('contact.field.city')" optional-label autocomplete="address-level2" />

                    <x-ui.input name="subject" :label="__('contact.field.subject')" optional-label class="sm:col-span-2" />

                    <x-ui.textarea
                        name="message"
                        :label="__('contact.field.message')"
                        :hint="__('contact.hint.message')"
                        rows="6"
                        required
                        class="sm:col-span-2"
                    />

                    <div class="sm:col-span-2">
                        <x-ui.button type="submit" size="lg">{{ __('cta.submit_request') }}</x-ui.button>
                    </div>
                </form>
            </div>

            {{-- Contact details -------------------------------------------- --}}
            <aside class="flex flex-col gap-4">
                <x-ui.card>
                    <dl class="flex flex-col gap-5">
                        <div>
                            <dt class="text-caption text-text-muted">{{ __('contact.channels.phone') }}</dt>
                            <dd class="mt-1 text-body font-medium">
                                <a href="tel:{{ preg_replace('/\s+/', '', (string) $settings->get('contact_phone')) }}" class="rounded-xs underline-offset-4 hover:underline">
                                    <x-ui.measure :value="$settings->get('contact_phone')" dir="ltr" />
                                </a>
                            </dd>
                        </div>

                        <div>
                            <dt class="text-caption text-text-muted">{{ __('contact.channels.email') }}</dt>
                            <dd class="mt-1 text-body font-medium">
                                <a href="mailto:{{ $settings->get('contact_email') }}" class="rounded-xs underline-offset-4 hover:underline">
                                    <x-ui.measure :value="$settings->get('contact_email')" dir="ltr" :tabular="false" />
                                </a>
                            </dd>
                        </div>

                        <div>
                            <dt class="text-caption text-text-muted">{{ __('contact.channels.address') }}</dt>
                            <dd class="mt-1 text-body-sm">{{ $settings->translated('contact_address') }}</dd>
                        </div>

                        <div>
                            <dt class="text-caption text-text-muted">{{ __('contact.channels.hours') }}</dt>
                            <dd class="mt-1 text-body-sm">{{ $settings->translated('contact_working_hours') }}</dd>
                        </div>
                    </dl>
                </x-ui.card>

                <x-ui.card tone="subtle">
                    <h2 class="text-h4">{{ __('cta.find_representative') }}</h2>
                    <p class="mt-2 text-body-sm text-text-muted">{{ __('pages.representatives.lead') }}</p>
                    <x-ui.button :href="lroute('representatives')" variant="outline" class="mt-4 self-start">
                        {{ __('cta.find_representative') }}
                    </x-ui.button>
                </x-ui.card>
            </aside>
        </div>
    </x-layout.section>
</x-layouts.app>
