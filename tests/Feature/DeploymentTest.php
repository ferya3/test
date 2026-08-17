<?php

declare(strict_types=1);

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;

/**
 * Guards the handful of things that only matter once the application is
 * deployed, and that nothing else would notice were broken.
 */
it('exposes a health endpoint for the deploy script to check', function (): void {
    // deploy.sh fails the release if this does not answer.
    $this->get('/up')->assertOk();
});

it('registers the scheduled work the systemd timer exists to run', function (): void {
    $descriptions = collect(app(Schedule::class)->events())
        ->map(fn ($event): string => (string) $event->description)
        ->all();

    expect($descriptions)->toContain('Drop failed jobs older than two weeks')
        ->and($descriptions)->toContain('Warm the sitemap cache');
});

it('names every scheduled event, which onOneServer requires', function (): void {
    // A closure event without a name throws at schedule:run time, not at
    // registration — so it would fail nightly on the server and nowhere else.
    foreach (app(Schedule::class)->events() as $event) {
        expect($event->description)->not->toBeEmpty();
    }
});

it('provides every artisan command the deploy scripts call', function (): void {
    // A rename upstream would otherwise surface as a failed deploy at 2am.
    $available = array_keys(Artisan::all());

    expect($available)->toContain(
        'migrate',
        'optimize',
        'optimize:clear',
        'queue:restart',
        'queue:prune-failed',
        'storage:link',
        'down',
        'up',
    );
});

it('reads trusted proxies from config so the setting survives config caching', function (): void {
    // The bug this pins: env() outside a config file returns null once
    // `php artisan optimize` has cached the config, which is what production
    // runs — so the setting silently did nothing there and only there.
    expect(config()->has('security.trusted_proxies'))->toBeTrue();

    $bootstrap = file_get_contents(base_path('bootstrap/app.php'));

    expect($bootstrap)->not->toContain("env('TRUSTED_PROXIES')");
});

it('keeps env() out of the runtime path entirely', function (): void {
    // Same class of bug, stated as a rule: anything under app/ runs on every
    // request, including in production where configuration is cached and .env
    // is never parsed. Config files are exempt — they are evaluated before
    // caching, and their result is what gets cached.
    //
    // Tokenised rather than grepped, so a mention of env() in a comment or a
    // string is not mistaken for a call. The first version of this test failed
    // on its own explanatory comment.
    $offenders = [];

    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(base_path('app'), FilesystemIterator::SKIP_DOTS)
    );

    foreach ($files as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }

        $tokens = token_get_all((string) file_get_contents($file->getPathname()));

        foreach ($tokens as $i => $token) {
            if (! is_array($token) || $token[0] !== T_STRING || $token[1] !== 'env') {
                continue;
            }

            // A method or property access (->env, ::env, $this->env) is not the
            // global helper.
            $previous = $tokens[$i - 1] ?? null;

            if (is_array($previous) && in_array($previous[0], [T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_FUNCTION], true)) {
                continue;
            }

            $offenders[] = str_replace(base_path().'/', '', $file->getPathname()).':'.$token[2];
        }
    }

    expect($offenders)->toBe([]);
});

/*
|--------------------------------------------------------------------------
| Offline bundle
|--------------------------------------------------------------------------
|
| `deploy/package.sh` ships a tarball containing vendor/ and public/build, and
| install-ubuntu.sh decides to skip composer, npm and Node by looking for those
| two artefacts rather than by reading a flag. That only distinguishes a bundle
| from a checkout while neither path is committed, which is what these guard.
|
*/

it('keeps the offline bundle markers out of version control', function (): void {
    // If either of these were ever committed, install-ubuntu.sh would treat a
    // plain git checkout as a bundle and skip installing its dependencies.
    exec('git -C '.escapeshellarg(base_path()).' ls-files -- vendor public/build', $tracked, $status);

    expect($status)->toBe(0)
        ->and($tracked)->toBe([]);
});

it('detects a bundle by both artefacts, and lets FORCE_DEPS override', function (): void {
    $installer = (string) file_get_contents(base_path('deploy/install-ubuntu.sh'));

    expect($installer)
        ->toContain('vendor/autoload.php')
        ->toContain('public/build/manifest.json')
        ->toContain('FORCE_DEPS');

    // Every step the bundle replaces has to be behind one of the two guards,
    // or an offline host still reaches for the network and the trap kills it.
    foreach (['composer install', 'npm ci', 'npm run build'] as $step) {
        expect($installer)->toContain($step);
    }

    expect($installer)
        ->toContain('BUNDLED_VENDOR')
        ->toContain('BUNDLED_ASSETS');
});

it('never ships an .env in the bundle', function (): void {
    // The installer leaves an existing .env untouched, so one inside the
    // tarball would become the server's configuration — carrying the packaging
    // machine's APP_KEY and database password onto a live host.
    $packager = (string) file_get_contents(base_path('deploy/package.sh'));

    expect($packager)->toContain('.env is in the bundle');
});
