<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Validation messages under the locale settings production actually runs with.
 *
 * The installer writes APP_LOCALE=fa and APP_FALLBACK_LOCALE=fa. Laravel ships
 * validation messages only in English, so with both set to fa there was nothing
 * to read and nothing to fall back to, and every failure rendered its raw key:
 * a visitor who left the contact form blank was shown "validation.required".
 *
 * The test environment does not reproduce that on its own — phpunit.xml leaves
 * the fallback on en, which quietly hides the whole problem behind English
 * sentences. So these pin the fallback to fa deliberately.
 */
beforeEach(function (): void {
    config(['app.locale' => 'fa', 'app.fallback_locale' => 'fa']);
    app()->setLocale('fa');
    app('translator')->setFallback('fa');
});

it('translates the rules the public contact form uses', function (): void {
    $validator = Validator::make(
        ['name' => '', 'email' => 'nonsense', 'message' => 'کوتاه', 'phone' => ''],
        [
            'name' => ['required', 'string', 'min:2'],
            'email' => ['nullable', 'email'],
            'message' => ['required', 'string', 'min:10'],
            'phone' => ['required', 'string'],
        ],
    );

    $validator->fails();

    foreach ($validator->errors()->all() as $message) {
        expect($message)->not->toStartWith('validation.');
    }
});

it('translates the password rules the panel and the console share', function (): void {
    $validator = Validator::make(
        ['password' => 'abc'],
        ['password' => [Password::min(12)->letters()->numbers()->symbols()]],
    );

    $validator->fails();

    $messages = $validator->errors()->all();

    expect($messages)->not->toBeEmpty();

    foreach ($messages as $message) {
        expect($message)->not->toStartWith('validation.');
    }
});

it('names the field in Persian rather than by its column', function (): void {
    $validator = Validator::make(['email' => ''], ['email' => ['required']]);
    $validator->fails();

    expect($validator->errors()->first('email'))->toContain('ایمیل');
});

it('covers every rule key the framework defines', function (): void {
    /*
     * Structural rather than sampled: a rule this application does not use
     * today is one it may use tomorrow, and the failure mode is a raw key in
     * front of a visitor rather than an exception anyone would notice.
     */
    $english = require base_path('vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php');
    $persian = require lang_path('fa/validation.php');

    $missing = array_diff(array_keys($english), array_keys($persian));

    expect($missing)->toBe([]);
});

it('keeps the size variants each rule needs', function (): void {
    // Laravel picks between numeric/file/string/array by the type of the value,
    // so a rule translated as a plain string still renders a raw key for three
    // of the four cases.
    $english = require base_path('vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php');
    $persian = require lang_path('fa/validation.php');

    $mismatched = [];

    foreach ($english as $rule => $value) {
        if (! is_array($value) || $rule === 'custom' || $rule === 'attributes') {
            continue;
        }

        $missing = array_diff(array_keys($value), array_keys((array) ($persian[$rule] ?? [])));

        if ($missing !== []) {
            $mismatched[] = $rule.': '.implode(', ', $missing);
        }
    }

    expect($mismatched)->toBe([]);
});
