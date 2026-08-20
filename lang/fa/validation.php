<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Validation messages — Persian
|--------------------------------------------------------------------------
|
| This file did not exist, and its absence was not a cosmetic problem.
|
| The installer writes APP_LOCALE=fa and APP_FALLBACK_LOCALE=fa. Laravel ships
| validation messages only in English, so with both locales set to fa there was
| no file to read and no fallback to reach — every failed validation rendered
| its raw key. A visitor who left a field blank on the contact form was shown
| "validation.required", and an operator setting a password was told
| "validation.min.string".
|
| Keys mirror the framework's own file exactly, including the size variants
| (numeric / file / string / array) that Laravel selects by the type of the
| value being validated.
|
*/

return [

    'accepted' => 'باید :attribute را بپذیرید.',
    'accepted_if' => 'وقتی :other برابر :value است، باید :attribute را بپذیرید.',
    'active_url' => ':attribute نشانی اینترنتی معتبری نیست.',
    'after' => ':attribute باید تاریخی بعد از :date باشد.',
    'after_or_equal' => ':attribute باید تاریخی برابر یا بعد از :date باشد.',
    'alpha' => ':attribute باید فقط شامل حرف باشد.',
    'alpha_dash' => ':attribute باید فقط شامل حرف، عدد، خط تیره و زیرخط باشد.',
    'alpha_num' => ':attribute باید فقط شامل حرف و عدد باشد.',
    'any_of' => ':attribute معتبر نیست.',
    'array' => ':attribute باید یک آرایه باشد.',
    'array_keys' => ':attribute باید شامل کلیدهای :values باشد.',
    'ascii' => ':attribute باید فقط شامل نویسه‌ها و نمادهای تک‌بایتی باشد.',
    'base64' => ':attribute باید یک رشتهٔ base64 معتبر باشد.',
    'before' => ':attribute باید تاریخی پیش از :date باشد.',
    'before_or_equal' => ':attribute باید تاریخی برابر یا پیش از :date باشد.',

    'between' => [
        'array' => ':attribute باید بین :min تا :max مورد داشته باشد.',
        'file' => 'حجم :attribute باید بین :min تا :max کیلوبایت باشد.',
        'numeric' => ':attribute باید بین :min تا :max باشد.',
        'string' => ':attribute باید بین :min تا :max نویسه باشد.',
    ],

    'boolean' => ':attribute باید درست یا نادرست باشد.',
    'can' => ':attribute شامل مقدار غیرمجاز است.',
    'confirmed' => 'تکرار :attribute با آن مطابقت ندارد.',
    'contains' => ':attribute فاقد یکی از مقادیر لازم است.',
    'current_password' => 'گذرواژه درست نیست.',
    'date' => ':attribute تاریخ معتبری نیست.',
    'date_equals' => ':attribute باید تاریخی برابر :date باشد.',
    'date_format' => ':attribute با قالب :format مطابقت ندارد.',
    'decimal' => ':attribute باید :decimal رقم اعشار داشته باشد.',
    'declined' => ':attribute باید رد شود.',
    'declined_if' => 'وقتی :other برابر :value است، :attribute باید رد شود.',
    'different' => ':attribute و :other باید متفاوت باشند.',
    'digits' => ':attribute باید :digits رقم باشد.',
    'digits_between' => ':attribute باید بین :min تا :max رقم باشد.',
    'dimensions' => 'ابعاد تصویر :attribute مجاز نیست.',
    'distinct' => ':attribute مقدار تکراری دارد.',
    'doesnt_contain' => ':attribute نباید شامل هیچ‌یک از این مقادیر باشد.',
    'doesnt_end_with' => ':attribute نباید به یکی از این‌ها ختم شود: :values.',
    'doesnt_start_with' => ':attribute نباید با یکی از این‌ها شروع شود: :values.',
    'email' => ':attribute باید یک نشانی ایمیل معتبر باشد.',
    'encoding' => ':attribute باید با کدگذاری :encoding باشد.',
    'ends_with' => ':attribute باید به یکی از این‌ها ختم شود: :values.',
    'enum' => ':attribute انتخاب‌شده معتبر نیست.',
    'exists' => ':attribute انتخاب‌شده معتبر نیست.',
    'extensions' => 'پسوند فایل :attribute باید یکی از این‌ها باشد: :values.',
    'file' => ':attribute باید یک فایل باشد.',
    'filled' => ':attribute نمی‌تواند خالی باشد.',

    'gt' => [
        'array' => ':attribute باید بیش از :value مورد داشته باشد.',
        'file' => 'حجم :attribute باید بیش از :value کیلوبایت باشد.',
        'numeric' => ':attribute باید بزرگ‌تر از :value باشد.',
        'string' => ':attribute باید بیش از :value نویسه باشد.',
    ],

    'gte' => [
        'array' => ':attribute باید :value مورد یا بیشتر داشته باشد.',
        'file' => 'حجم :attribute باید :value کیلوبایت یا بیشتر باشد.',
        'numeric' => ':attribute باید بزرگ‌تر یا برابر :value باشد.',
        'string' => ':attribute باید :value نویسه یا بیشتر باشد.',
    ],

    'hex_color' => ':attribute باید یک کد رنگ هگز معتبر باشد.',
    'image' => ':attribute باید یک تصویر باشد.',
    'in' => ':attribute انتخاب‌شده معتبر نیست.',
    'in_array' => ':attribute در :other وجود ندارد.',
    'in_array_keys' => ':attribute باید دست‌کم یکی از این کلیدها را داشته باشد: :values.',
    'integer' => ':attribute باید عدد صحیح باشد.',
    'ip' => ':attribute باید یک نشانی IP معتبر باشد.',
    'ipv4' => ':attribute باید یک نشانی IPv4 معتبر باشد.',
    'ipv6' => ':attribute باید یک نشانی IPv6 معتبر باشد.',
    'json' => ':attribute باید یک رشتهٔ JSON معتبر باشد.',
    'list' => ':attribute باید یک فهرست باشد.',
    'lowercase' => ':attribute باید با حروف کوچک باشد.',

    'lt' => [
        'array' => ':attribute باید کمتر از :value مورد داشته باشد.',
        'file' => 'حجم :attribute باید کمتر از :value کیلوبایت باشد.',
        'numeric' => ':attribute باید کوچک‌تر از :value باشد.',
        'string' => ':attribute باید کمتر از :value نویسه باشد.',
    ],

    'lte' => [
        'array' => ':attribute نباید بیش از :value مورد داشته باشد.',
        'file' => 'حجم :attribute باید :value کیلوبایت یا کمتر باشد.',
        'numeric' => ':attribute باید کوچک‌تر یا برابر :value باشد.',
        'string' => ':attribute باید :value نویسه یا کمتر باشد.',
    ],

    'mac_address' => ':attribute باید یک نشانی MAC معتبر باشد.',

    'max' => [
        'array' => ':attribute نباید بیش از :max مورد داشته باشد.',
        'file' => 'حجم :attribute نباید بیش از :max کیلوبایت باشد.',
        'numeric' => ':attribute نباید بزرگ‌تر از :max باشد.',
        'string' => ':attribute نباید بیش از :max نویسه باشد.',
    ],

    'max_digits' => ':attribute نباید بیش از :max رقم باشد.',
    'mimes' => ':attribute باید فایلی از نوع :values باشد.',
    'mimetypes' => ':attribute باید فایلی از نوع :values باشد.',

    'min' => [
        'array' => ':attribute باید دست‌کم :min مورد داشته باشد.',
        'file' => 'حجم :attribute باید دست‌کم :min کیلوبایت باشد.',
        'numeric' => ':attribute باید دست‌کم :min باشد.',
        'string' => ':attribute باید دست‌کم :min نویسه باشد.',
    ],

    'min_digits' => ':attribute باید دست‌کم :min رقم باشد.',
    'missing' => ':attribute نباید وجود داشته باشد.',
    'missing_if' => 'وقتی :other برابر :value است، :attribute نباید وجود داشته باشد.',
    'missing_unless' => 'مگر آنکه :other برابر :value باشد، :attribute نباید وجود داشته باشد.',
    'missing_with' => 'وقتی :values موجود است، :attribute نباید وجود داشته باشد.',
    'missing_with_all' => 'وقتی :values موجودند، :attribute نباید وجود داشته باشد.',
    'multiple_of' => ':attribute باید مضربی از :value باشد.',
    'not_in' => ':attribute انتخاب‌شده معتبر نیست.',
    'not_regex' => 'قالب :attribute معتبر نیست.',
    'numeric' => ':attribute باید عدد باشد.',

    /*
     * The Rules\Password sub-keys. `user:password` and the panel both use
     * Password::min(12)->letters()->numbers()->symbols(), so these four are the
     * ones an operator is most likely to meet.
     */
    'password' => [
        'letters' => ':attribute باید دست‌کم یک حرف داشته باشد.',
        'mixed' => ':attribute باید دست‌کم یک حرف بزرگ و یک حرف کوچک داشته باشد.',
        'numbers' => ':attribute باید دست‌کم یک عدد داشته باشد.',
        'symbols' => ':attribute باید دست‌کم یک نماد داشته باشد.',
        'uncompromised' => 'این :attribute در نشت اطلاعات دیده شده است. لطفاً مقدار دیگری انتخاب کنید.',
    ],

    'present' => ':attribute باید وجود داشته باشد.',
    'present_if' => 'وقتی :other برابر :value است، :attribute باید وجود داشته باشد.',
    'present_unless' => 'مگر آنکه :other برابر :value باشد، :attribute باید وجود داشته باشد.',
    'present_with' => 'وقتی :values موجود است، :attribute باید وجود داشته باشد.',
    'present_with_all' => 'وقتی :values موجودند، :attribute باید وجود داشته باشد.',
    'prohibited' => ':attribute مجاز نیست.',
    'prohibited_if' => 'وقتی :other برابر :value است، :attribute مجاز نیست.',
    'prohibited_if_accepted' => 'وقتی :other پذیرفته شده است، :attribute مجاز نیست.',
    'prohibited_if_declined' => 'وقتی :other رد شده است، :attribute مجاز نیست.',
    'prohibited_unless' => 'مگر آنکه :other یکی از :values باشد، :attribute مجاز نیست.',
    'prohibits' => ':attribute باعث می‌شود :other مجاز نباشد.',
    'regex' => 'قالب :attribute معتبر نیست.',
    'required' => ':attribute الزامی است.',
    'required_array_keys' => ':attribute باید شامل کلیدهای :values باشد.',
    'required_if' => 'وقتی :other برابر :value است، :attribute الزامی است.',
    'required_if_accepted' => 'وقتی :other پذیرفته شده است، :attribute الزامی است.',
    'required_if_declined' => 'وقتی :other رد شده است، :attribute الزامی است.',
    'required_unless' => 'مگر آنکه :other یکی از :values باشد، :attribute الزامی است.',
    'required_with' => 'وقتی :values موجود است، :attribute الزامی است.',
    'required_with_all' => 'وقتی :values موجودند، :attribute الزامی است.',
    'required_without' => 'وقتی :values موجود نیست، :attribute الزامی است.',
    'required_without_all' => 'وقتی هیچ‌یک از :values موجود نیست، :attribute الزامی است.',
    'same' => ':attribute و :other باید یکسان باشند.',

    'size' => [
        'array' => ':attribute باید :size مورد داشته باشد.',
        'file' => 'حجم :attribute باید :size کیلوبایت باشد.',
        'numeric' => ':attribute باید برابر :size باشد.',
        'string' => ':attribute باید :size نویسه باشد.',
    ],

    'starts_with' => ':attribute باید با یکی از این‌ها شروع شود: :values.',
    'string' => ':attribute باید یک رشته باشد.',
    'timezone' => ':attribute باید یک منطقهٔ زمانی معتبر باشد.',
    'unique' => ':attribute پیش‌تر ثبت شده است.',
    'uploaded' => 'بارگذاری :attribute ناموفق بود.',
    'uppercase' => ':attribute باید با حروف بزرگ باشد.',
    'url' => ':attribute باید یک نشانی اینترنتی معتبر باشد.',
    'ulid' => ':attribute باید یک ULID معتبر باشد.',
    'uuid' => ':attribute باید یک UUID معتبر باشد.',

    'custom' => [
        'website' => [
            // The honeypot on the public forms. A human never fills it, so the
            // wording only ever reaches a bot — but a raw key in a response body
            // is a fingerprint, and this is cheaper than one.
            'prohibited' => 'ارسال فرم ناموفق بود.',
        ],
    ],

    /*
     * Field names as they appear inside a message. Without these the sentence
     * is Persian but names its field in English — "email الزامی است."
     */
    'attributes' => [
        'name' => 'نام',
        'company' => 'نام شرکت',
        'phone' => 'تلفن',
        'email' => 'ایمیل',
        'province' => 'استان',
        'city' => 'شهر',
        'subject' => 'موضوع',
        'message' => 'پیام',
        'type' => 'نوع درخواست',
        'product_id' => 'محصول',
        'password' => 'گذرواژه',
        'password_confirmation' => 'تکرار گذرواژه',
        'current_password' => 'گذرواژهٔ فعلی',
        'title' => 'عنوان',
        'slug' => 'نشانی یکتا',
        'body' => 'متن',
        'subtitle' => 'زیرعنوان',
        'position' => 'ترتیب',
        'is_active' => 'فعال',
        'code' => 'کد',
        'file' => 'فایل',
        'image' => 'تصویر',
        'hero_media_id' => 'تصویر هیرو',
    ],

];
