<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * `user:password` is the supported way to rotate a password on a provisioned
 * host, so the things that would make an operator reach for tinker again — a
 * silent no-op, a wrong-account edit, a double-hashed value — are what these
 * cover.
 */
it('sets the password of an existing account', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.test']);

    $this->artisan('user:password', ['email' => 'admin@example.test'])
        ->expectsQuestion('New password', 'Correct-Horse-9!')
        ->expectsQuestion('Confirm new password', 'Correct-Horse-9!')
        ->assertSuccessful();

    expect(Hash::check('Correct-Horse-9!', $user->fresh()->password))->toBeTrue();
});

it('stores the password hashed exactly once', function (): void {
    // User casts `password` as `hashed`. Hashing before assignment as well
    // would produce a value no login could ever match.
    $user = User::factory()->create(['email' => 'admin@example.test']);

    $this->artisan('user:password', ['email' => 'admin@example.test'])
        ->expectsQuestion('New password', 'Correct-Horse-9!')
        ->expectsQuestion('Confirm new password', 'Correct-Horse-9!')
        ->assertSuccessful();

    $stored = $user->fresh()->password;

    expect($stored)->not->toBe('Correct-Horse-9!')
        ->and(Hash::isHashed($stored))->toBeTrue()
        ->and(Hash::check('Correct-Horse-9!', $stored))->toBeTrue();
});

it('changes nothing when the confirmation does not match', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.test']);
    $before = $user->password;

    $this->artisan('user:password', ['email' => 'admin@example.test'])
        ->expectsQuestion('New password', 'Correct-Horse-9!')
        ->expectsQuestion('Confirm new password', 'Correct-Horse-8!')
        ->assertFailed();

    expect($user->fresh()->password)->toBe($before);
});

it('rejects a weak password rather than accepting it quietly', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.test']);
    $before = $user->password;

    $this->artisan('user:password', ['email' => 'admin@example.test'])
        ->expectsQuestion('New password', 'password')
        ->expectsQuestion('Confirm new password', 'password')
        ->assertFailed();

    expect($user->fresh()->password)->toBe($before);
});

it('fails and lists the accounts when the email is unknown', function (): void {
    User::factory()->create(['email' => 'real@example.test']);

    $this->artisan('user:password', ['email' => 'typo@example.test'])
        ->expectsOutputToContain('real@example.test')
        ->assertFailed();
});

it('generates a password without prompting', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.test']);
    $before = $user->password;

    $this->artisan('user:password', ['email' => 'admin@example.test', '--generate' => true])
        ->assertSuccessful();

    expect($user->fresh()->password)->not->toBe($before);
});
