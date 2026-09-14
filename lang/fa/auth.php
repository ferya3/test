<?php

declare(strict_types=1);

return [
    // Deliberately identical for a wrong password and an unknown address, so
    // the form cannot be used to discover which accounts exist.
    'failed' => 'اطلاعات ورود صحیح نیست.',
    'password' => 'گذرواژه وارد شده صحیح نیست.',
    'throttle' => 'تلاش‌های بیش از حد. لطفاً :seconds ثانیه دیگر دوباره تلاش کنید.',
    'no_access' => 'این حساب کاربری به پنل مدیریت دسترسی ندارد.',

    'two_factor' => [
        // The one cause the application cannot fix for the user is a clock:
        // TOTP tolerates thirty seconds either way, so a phone or server that
        // has drifted rejects every code with nothing to explain it.
        'invalid' => 'کد وارد شده معتبر نیست. اگر کد را همین حالا از برنامه خوانده‌اید، ساعت دستگاه‌تان را بررسی کنید.',
    ],
];
