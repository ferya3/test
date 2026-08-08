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
        'invalid' => 'کد وارد شده معتبر نیست.',
    ],
];
