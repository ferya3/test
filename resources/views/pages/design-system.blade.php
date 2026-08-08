{{--
    Living reference for the design system. Registered only outside production
    (see routes/web.php) and used to review tokens, components and both writing
    directions side by side.
--}}
<x-layouts.app :title="__('Design System')">
    <x-layout.section size="sm">
        <x-layout.section-header
            overline="Stage 2"
            heading="Design System"
            lead="Tokens, typography and components. Every colour pairing shown here is verified against WCAG AA by npm run check:contrast."
            :level="1"
            dir="ltr"
        />
    </x-layout.section>

    {{-- Palette ---------------------------------------------------------- --}}
    <x-layout.section tone="subtle" size="sm">
        <x-layout.section-header heading="Semantic colour" :level="2" class="mb-8" />

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            @foreach ([
                ['Surface', 'bg-surface', 'text-text'],
                ['Surface subtle', 'bg-surface-subtle', 'text-text'],
                ['Surface raised', 'bg-surface-raised', 'text-text'],
                ['Surface inverse', 'bg-surface-inverse', 'text-text-inverse'],
                ['Accent surface', 'bg-accent-surface', 'text-text-on-accent'],
                ['Accent tint', 'bg-accent-tint', 'text-accent-tint-text'],
                ['Success', 'bg-success-surface', 'text-white'],
                ['Danger', 'bg-danger-surface', 'text-white'],
            ] as [$label, $bg, $fg])
                <div class="overflow-hidden rounded-lg border border-border">
                    <div class="{{ $bg }} {{ $fg }} flex h-24 items-end p-3">
                        <span class="text-caption font-medium">Aa — آ</span>
                    </div>
                    <p class="bg-surface-raised px-3 py-2 text-caption text-text-muted">{{ $label }}</p>
                </div>
            @endforeach
        </div>
    </x-layout.section>

    {{-- Typography ------------------------------------------------------- --}}
    <x-layout.section size="sm">
        <x-layout.section-header heading="Type scale" :level="2" class="mb-8" />

        <div class="flex flex-col gap-6">
            <div>
                <p class="mb-1 text-caption text-text-muted">text-display</p>
                <p class="text-display">پنل کابینت آشپزخانه</p>
            </div>
            <div>
                <p class="mb-1 text-caption text-text-muted">text-h1</p>
                <p class="text-h1">Decorative Panels</p>
            </div>
            <div>
                <p class="mb-1 text-caption text-text-muted">text-h2</p>
                <p class="text-h2">فرایند تولید</p>
            </div>
            <div>
                <p class="mb-1 text-caption text-text-muted">text-h3</p>
                <p class="text-h3">Quality Control</p>
            </div>
            <div>
                <p class="mb-1 text-caption text-text-muted">text-lead</p>
                <p class="text-lead max-w-content text-text-secondary">
                    تولید پنل کابینت و پنل تزئینی با خط تولید تمام‌اتوماتیک و آزمایشگاه کنترل کیفیت.
                </p>
            </div>
            <div>
                <p class="mb-1 text-caption text-text-muted">text-body</p>
                <p class="max-w-content">
                    این پنل با روکش بلوط طبیعی و سطح مات تولید می‌شود. پرس گرم و چسب مقاوم به رطوبت،
                    پایداری ابعادی و دوام سطح را تضمین می‌کند.
                </p>
            </div>
            <div>
                <p class="mb-2 text-caption text-text-muted">
                    Bidi isolation — Latin values inside Persian text
                </p>

                <table class="text-body-sm">
                    <thead>
                        <tr class="text-caption text-text-muted">
                            <th class="pe-8 py-1 text-start font-medium">مشخصه</th>
                            <th class="pe-8 py-1 text-start font-medium">صحیح (x-ui.measure)</th>
                            <th class="py-1 text-start font-medium">بدون ایزوله‌سازی</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ([
                            ['چگالی', '740', 'kg/m³'],
                            ['مقاومت خمشی', '23', 'N/mm²'],
                            ['ابعاد ورق', '2800 × 1220', 'mm'],
                            ['مقاومت به حرارت', 'تا 180', '°C'],
                        ] as [$label, $value, $unit])
                            <tr>
                                <td class="pe-8 py-1 text-text-muted">{{ $label }}</td>
                                <td class="pe-8 py-1"><x-ui.measure :value="$value" :unit="$unit" /></td>
                                {{-- Shown deliberately without isolation so the
                                     reordering this component prevents is visible. --}}
                                <td class="py-1 text-text-placeholder">{{ $value }} {{ $unit }}</td>
                            </tr>
                        @endforeach
                        <tr>
                            <td class="pe-8 py-1 text-text-muted">تلفن کارخانه</td>
                            <td class="pe-8 py-1"><x-ui.measure value="+98 21 1234 5678" dir="ltr" /></td>
                            <td class="py-1 text-text-placeholder">+98 21 1234 5678</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </x-layout.section>

    {{-- Buttons ---------------------------------------------------------- --}}
    <x-layout.section tone="subtle" size="sm">
        <x-layout.section-header heading="Buttons" :level="2" class="mb-8" />

        <div class="flex flex-col gap-6">
            <div class="flex flex-wrap items-center gap-3">
                <x-ui.button>{{ __('cta.view_products') }}</x-ui.button>
                <x-ui.button variant="secondary">{{ __('cta.download_catalog') }}</x-ui.button>
                <x-ui.button variant="outline">{{ __('cta.request_sample') }}</x-ui.button>
                <x-ui.button variant="ghost">{{ __('cta.read_more') }}</x-ui.button>
                <x-ui.button variant="link">{{ __('cta.view_all') }}</x-ui.button>
                <x-ui.button variant="danger">Delete</x-ui.button>
            </div>

            <div class="flex flex-wrap items-center gap-3">
                <x-ui.button size="sm">Small</x-ui.button>
                <x-ui.button size="md">Medium</x-ui.button>
                <x-ui.button size="lg">Large</x-ui.button>
                <x-ui.button disabled>Disabled</x-ui.button>
                <x-ui.button loading>Loading</x-ui.button>
            </div>
        </div>
    </x-layout.section>

    {{-- Badges and alerts ------------------------------------------------ --}}
    <x-layout.section size="sm">
        <x-layout.section-header heading="Badges & alerts" :level="2" class="mb-8" />

        <div class="mb-8 flex flex-wrap gap-2">
            <x-ui.badge>Neutral</x-ui.badge>
            <x-ui.badge tone="accent">های‌گلاس</x-ui.badge>
            <x-ui.badge tone="success">موجود</x-ui.badge>
            <x-ui.badge tone="warning">محدود</x-ui.badge>
            <x-ui.badge tone="danger">ناموجود</x-ui.badge>
            <x-ui.badge tone="info">جدید</x-ui.badge>
            <x-ui.badge tone="inverse">E1</x-ui.badge>
        </div>

        <div class="flex max-w-2xl flex-col gap-4">
            <x-ui.alert tone="info" title="اطلاع">کاتالوگ جدید ۱۴۰۵ منتشر شد.</x-ui.alert>
            <x-ui.alert tone="success">درخواست شما با موفقیت ثبت شد.</x-ui.alert>
            <x-ui.alert tone="warning">این محصول تنها در ضخامت ۱۸ میلی‌متر موجود است.</x-ui.alert>
            <x-ui.alert tone="danger" dismissible>ارسال فرم با خطا مواجه شد.</x-ui.alert>
        </div>
    </x-layout.section>

    {{-- Forms ------------------------------------------------------------ --}}
    <x-layout.section tone="subtle" size="sm">
        <x-layout.section-header
            heading="Form controls"
            lead="Labels, hints and errors are wired to their control with aria-describedby, so a validation failure is announced with the field it belongs to."
            :level="2"
            class="mb-8"
            dir="ltr"
        />

        <div class="grid max-w-3xl gap-6 sm:grid-cols-2">
            <x-ui.input name="demo_name" :label="__('نام و نام خانوادگی')" required placeholder="نام خود را وارد کنید" />
            <x-ui.input
                name="demo_phone"
                type="tel"
                :label="__('شماره تماس')"
                hint="با کد شهر یا به صورت موبایل"
                required
            />
            <x-ui.select
                name="demo_province"
                :label="__('استان')"
                placeholder="انتخاب کنید"
                :options="collect(App\Support\IranProvinces::all())->take(6)->mapWithKeys(fn ($p) => [$p => $p])->all()"
            />
            <x-ui.input name="demo_company" :label="__('نام شرکت')" optional-label />
            <x-ui.textarea name="demo_message" :label="__('پیام شما')" class="sm:col-span-2" rows="4" />

            {{-- Error state, forced so the styling is reviewable here. --}}
            <x-ui.input
                name="demo_email"
                type="email"
                :label="__('ایمیل')"
                error="ایمیل وارد شده معتبر نیست."
                value="not-an-email"
            />

            <div class="flex flex-col gap-1 self-end">
                <x-ui.checkbox name="demo_surface" value="high-gloss" label="های‌گلاس" :count="12" checked />
                <x-ui.checkbox name="demo_surface2" value="super-matte" label="سوپرمات" :count="8" />
                <x-ui.checkbox name="demo_surface3" value="matte" label="مات" :count="21" />
            </div>
        </div>
    </x-layout.section>

    {{-- Cards and media -------------------------------------------------- --}}
    <x-layout.section size="sm">
        <x-layout.section-header heading="Cards & media" :level="2" class="mb-8" />

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            @foreach ([
                ['پنل های‌گلاس سفید ساده', 'PNL-1001', 'های‌گلاس'],
                ['پنل سوپرمات گرافیتی', 'PNL-1006', 'سوپرمات'],
                ['پنل ممبران بلوط طبیعی', 'PNL-1009', 'طرح‌دار'],
            ] as $index => [$name, $code, $surface])
                <x-ui.card href="#" :labelledby="'demo-card-'.$index" padding="none" class="overflow-hidden">
                    {{-- media is null here: the placeholder still reserves layout
                         space, which is what keeps CLS at zero. --}}
                    <x-media.picture ratio="4/3" :alt="$name" class="w-full" />

                    <div class="flex flex-1 flex-col gap-2 p-5">
                        <div class="flex items-center justify-between gap-2">
                            <x-ui.badge tone="accent" size="sm">{{ $surface }}</x-ui.badge>
                            <span class="tabular text-caption text-text-muted">{{ $code }}</span>
                        </div>
                        <h3 id="demo-card-{{ $index }}" class="text-h4">{{ $name }}</h3>
                        <p class="text-body-sm text-text-muted">مناسب کابینت آشپزخانه و کمد دیواری.</p>
                    </div>
                </x-ui.card>
            @endforeach
        </div>
    </x-layout.section>

    {{-- Breadcrumbs ------------------------------------------------------ --}}
    <x-layout.section tone="subtle" size="sm">
        <x-layout.section-header heading="Breadcrumbs" :level="2" class="mb-6" />

        <x-ui.breadcrumbs :items="[
            ['label' => __('ui.home'), 'url' => '#'],
            ['label' => __('nav.products'), 'url' => '#'],
            ['label' => 'پنل کابینت', 'url' => '#'],
            ['label' => 'پنل های‌گلاس سفید ساده'],
        ]" />
    </x-layout.section>

    {{-- Motion and focus ------------------------------------------------- --}}
    <x-layout.section size="sm">
        <x-layout.section-header
            heading="Focus & motion"
            lead="Tab through this page: every interactive element shows the same amber focus ring. All transitions are transform and opacity only, and are disabled under prefers-reduced-motion."
            :level="2"
            dir="ltr"
        />
    </x-layout.section>
</x-layouts.app>
