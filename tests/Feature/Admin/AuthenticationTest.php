<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use App\Support\Enums\RoleName;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use PragmaRX\Google2FA\Google2FA;

beforeEach(function (): void {
    $this->seed(RolePermissionSeeder::class);
    RateLimiter::clear('login');
});

/**
 * Marks the two-factor gate as already passed for this session, which is what
 * a successful challenge does.
 */
function passedTwoFactor(): void
{
    session([RequireTwoFactor::SESSION_KEY => time()]);
}

describe('sign in', function (): void {
    it('shows the form to a guest', function (): void {
        $this->get('/admin/login')->assertOk()->assertSee(__('admin.sign_in'));
    });

    it('signs in an editor and lands on the dashboard', function (): void {
        // Editors are not a privileged role, so no two-factor gate applies.
        $user = User::factory()->editor()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->post('/admin/login', [
            'email' => $user->email,
            'password' => 'correct-horse-battery',
        ])->assertRedirect('/admin');

        $this->assertAuthenticatedAs($user);
    });

    it('records the sign-in', function (): void {
        $user = User::factory()->editor()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'correct-horse-battery']);

        expect($user->fresh()->last_login_at)->not->toBeNull()
            ->and($user->fresh()->last_login_ip)->not->toBeNull();
    });

    it('regenerates the session so a fixed id cannot be reused', function (): void {
        $user = User::factory()->editor()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->get('/admin/login');
        $before = session()->getId();

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'correct-horse-battery']);

        expect(session()->getId())->not->toBe($before);
    });

    it('rejects a wrong password', function (): void {
        $user = User::factory()->editor()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    });

    it('gives the same message for an unknown address as for a wrong password', function (): void {
        // Otherwise the form is an account-enumeration oracle.
        $user = User::factory()->editor()->create(['password' => Hash::make('correct-horse-battery')]);

        $wrongPassword = $this->post('/admin/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertSessionHasErrors('email');
        $unknownEmail = $this->post('/admin/login', ['email' => 'nobody@example.com', 'password' => 'wrong'])
            ->assertSessionHasErrors('email');

        expect(session('errors')->first('email'))->toBe(__('auth.failed'));
    });

    it('refuses a user with no admin role', function (): void {
        $user = User::factory()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'correct-horse-battery'])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    });

    it('refuses a deactivated account', function (): void {
        $user = User::factory()->editor()->inactive()->create(['password' => Hash::make('correct-horse-battery')]);

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'correct-horse-battery'])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    });

    it('throttles repeated failures', function (): void {
        $user = User::factory()->editor()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->post('/admin/login', ['email' => $user->email, 'password' => 'wrong']);
        }

        $this->post('/admin/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertSessionHasErrors('email');

        expect(session('errors')->first('email'))->toContain('ثانیه');
    });

    it('signs out and invalidates the session', function (): void {
        $user = User::factory()->editor()->create();

        $this->actingAs($user)->post('/admin/logout')->assertRedirect('/admin/login');

        $this->assertGuest();
    });
});

describe('access control', function (): void {
    it('sends a guest to the sign-in form', function (): void {
        $this->get('/admin')->assertRedirect('/admin/login');
    });

    it('hides the panel from an authenticated non-admin', function (): void {
        // 404 rather than 403: an ordinary user learns nothing about what is
        // behind this prefix.
        $this->actingAs(User::factory()->create())->get('/admin')->assertNotFound();
    });

    it('logs out an account deactivated mid-session', function (): void {
        $user = User::factory()->editor()->create();

        $this->actingAs($user)->get('/admin')->assertOk();

        $user->update(['is_active' => false]);

        // Revocation takes effect on the next request, not whenever the
        // session happens to expire.
        $this->actingAs($user)->get('/admin')->assertNotFound();
        $this->assertGuest();
    });
});

describe('two factor', function (): void {
    it('is not required for an editor', function (): void {
        $this->actingAs(User::factory()->editor()->create())->get('/admin')->assertOk();
    });

    it('sends an admin without enrolment to set-up', function (): void {
        $user = User::factory()->withRole(RoleName::Admin)->create();

        $this->actingAs($user)->get('/admin')->assertRedirect('/admin/two-factor/setup');
    });

    it('sends an enrolled admin to the challenge', function (): void {
        $user = User::factory()->admin()->create();

        $this->actingAs($user)->get('/admin')->assertRedirect('/admin/two-factor/challenge');
    });

    it('lets an admin through once the challenge is passed', function (): void {
        $user = User::factory()->admin()->create();

        $this->actingAs($user);
        passedTwoFactor();

        $this->get('/admin')->assertOk();
    });

    it('enforces the gate on every admin route, not just the dashboard', function (): void {
        // A deep link must not be a way around the second factor.
        $user = User::factory()->admin()->create();

        $this->actingAs($user)->get('/admin/products')->assertRedirect('/admin/two-factor/challenge');
        $this->actingAs($user)->get('/admin/users')->assertRedirect('/admin/two-factor/challenge');
        $this->actingAs($user)->get('/admin/settings')->assertRedirect('/admin/two-factor/challenge');
    });

    it('accepts a valid TOTP code', function (): void {
        $user = User::factory()->withRole(RoleName::Admin)->create();
        $secret = app(TwoFactorService::class)->generateSecret($user);
        app(TwoFactorService::class)->confirm($user, (new Google2FA)->getCurrentOtp($secret));

        $this->actingAs($user->fresh())
            ->post('/admin/two-factor/challenge', ['code' => (new Google2FA)->getCurrentOtp($secret)])
            ->assertRedirect('/admin');

        expect(session(RequireTwoFactor::SESSION_KEY))->not->toBeNull();
    });

    it('rejects an invalid code', function (): void {
        $user = User::factory()->admin()->create();

        $this->actingAs($user)
            ->post('/admin/two-factor/challenge', ['code' => '000000'])
            ->assertSessionHasErrors('code');

        expect(session(RequireTwoFactor::SESSION_KEY))->toBeNull();
    });

    it('accepts a recovery code exactly once', function (): void {
        $user = User::factory()->admin()->create();
        $code = $user->two_factor_recovery_codes[0];

        $this->actingAs($user)
            ->post('/admin/two-factor/challenge', ['recovery_code' => $code])
            ->assertRedirect('/admin');

        // Re-using it must fail.
        session()->forget(RequireTwoFactor::SESSION_KEY);

        $this->actingAs($user->fresh())
            ->post('/admin/two-factor/challenge', ['recovery_code' => $code])
            ->assertSessionHasErrors('code');
    });

    it('completes enrolment and issues recovery codes', function (): void {
        $user = User::factory()->withRole(RoleName::Admin)->create();

        $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk();

        $secret = $user->fresh()->two_factor_secret;

        $this->post('/admin/two-factor/setup', ['code' => (new Google2FA)->getCurrentOtp($secret)])
            ->assertOk()
            ->assertSee(__('admin.two_factor.recovery_title'));

        expect($user->fresh()->hasEnabledTwoFactor())->toBeTrue()
            ->and($user->fresh()->two_factor_recovery_codes)->toHaveCount(8);
    });

    it('does not activate a secret until a code proves it was scanned', function (): void {
        // A mis-scanned QR code must not lock someone out of their own account.
        $user = User::factory()->withRole(RoleName::Admin)->create();

        $this->actingAs($user)->get('/admin/two-factor/setup')->assertOk();

        expect($user->fresh()->two_factor_secret)->not->toBeNull()
            ->and($user->fresh()->hasEnabledTwoFactor())->toBeFalse();

        $this->post('/admin/two-factor/setup', ['code' => '000000'])
            ->assertSessionHasErrors('code');

        expect($user->fresh()->hasEnabledTwoFactor())->toBeFalse();
    });

    it('keeps the same secret across a refresh of the set-up page', function (): void {
        // Rotating it on each render would break a scan in progress.
        $user = User::factory()->withRole(RoleName::Admin)->create();

        $this->actingAs($user)->get('/admin/two-factor/setup');
        $first = $user->fresh()->two_factor_secret;

        $this->get('/admin/two-factor/setup');

        expect($user->fresh()->two_factor_secret)->toBe($first);
    });
});
