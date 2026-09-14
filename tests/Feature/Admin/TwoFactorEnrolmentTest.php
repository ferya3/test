<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Auth\TwoFactorService;
use App\Support\Enums\RoleName;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;
use PragmaRX\Google2FA\Google2FA;

/**
 * Enrolment from the authenticator's point of view.
 *
 * The existing tests take the secret from `$user->two_factor_secret` and build
 * a code from that. A real person takes it from the QR code on the page, so
 * anything that makes the page's secret differ from the one `confirm()` checks
 * is invisible to those tests and fails for every actual user.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class]);
});

/**
 * What an authenticator app does: read the otpauth:// URI and keep the `secret`
 * query parameter.
 */
function secretFromUri(string $uri): string
{
    parse_str((string) parse_url($uri, PHP_URL_QUERY), $query);

    return (string) ($query['secret'] ?? '');
}

/**
 * The secret as the page offers it.
 *
 * The QR is rendered as SVG paths, so there is no readable URI in the markup —
 * but the page also prints the key for manual entry, and that is the same
 * string the QR encodes (asserted by the first test below).
 */
function secretOnSetupPage(string $html): string
{
    preg_match('/>([A-Z2-7]{16})</', $html, $m);

    return $m[1] ?? '';
}

it('puts the same secret in the provisioning URI as it stores, and prints it for manual entry', function (): void {
    $user = User::factory()->withRole(RoleName::Admin)->create();
    $service = app(TwoFactorService::class);

    $secret = $service->generateSecret($user);
    $uri = $service->provisioningUri($user, $secret);

    expect(secretFromUri($uri))->toBe($secret);

    // And the manual-entry key on the page is that same secret, which is what
    // lets the tests below stand in for scanning the QR.
    $html = $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk()->getContent();

    expect(secretOnSetupPage($html))->toBe($user->fresh()->two_factor_secret);
});

it('accepts a code built from the secret in the QR code on the page', function (): void {
    // The whole flow as a person performs it: open the page, scan what is on
    // it, type the code that authenticator produces.
    $user = User::factory()->withRole(RoleName::Admin)->create();

    $html = $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk()->getContent();
    $scanned = secretOnSetupPage($html);

    expect($scanned)->not->toBe('');

    $this->post('/admin/two-factor/setup', ['code' => (new Google2FA)->getCurrentOtp($scanned)])
        ->assertOk()
        ->assertSee(__('admin.two_factor.recovery_title'));

    expect($user->fresh()->hasEnabledTwoFactor())->toBeTrue();
});

it('still accepts the scanned code after the page is refreshed', function (): void {
    // Refreshing between scanning and typing must not rotate the secret out
    // from under the authenticator.
    $user = User::factory()->withRole(RoleName::Admin)->create();

    $scanned = secretOnSetupPage(
        $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk()->getContent(),
    );

    $this->get('/admin/two-factor/setup')->assertOk();

    $this->post('/admin/two-factor/setup', ['code' => (new Google2FA)->getCurrentOtp($scanned)])
        ->assertOk();

    expect($user->fresh()->hasEnabledTwoFactor())->toBeTrue();
});

it('still accepts the scanned code when the session is lost in between', function (): void {
    // A dropped session is ordinary: a Redis restart, an expired cookie, the
    // admin finishing enrolment in a second tab. The secret lives on the user
    // record, so losing the session must not invalidate a scanned QR code.
    $user = User::factory()->withRole(RoleName::Admin)->create();

    $scanned = secretOnSetupPage(
        $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk()->getContent(),
    );

    session()->flush();

    $this->actingAs($user->fresh())
        ->post('/admin/two-factor/setup', ['code' => (new Google2FA)->getCurrentOtp($scanned)])
        ->assertOk();

    expect($user->fresh()->hasEnabledTwoFactor())->toBeTrue();
});

it('still accepts the scanned code when the page is reopened in a new session', function (): void {
    // The failure a person actually hits: scan, lose the session, land on the
    // set-up page again, and type the code from the QR they already scanned.
    $user = User::factory()->withRole(RoleName::Admin)->create();

    $scanned = secretOnSetupPage(
        $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk()->getContent(),
    );

    session()->flush();

    $this->actingAs($user->fresh())->get('/admin/two-factor/setup')->assertOk();

    $this->post('/admin/two-factor/setup', ['code' => (new Google2FA)->getCurrentOtp($scanned)])
        ->assertOk();

    expect($user->fresh()->hasEnabledTwoFactor())->toBeTrue();
});
