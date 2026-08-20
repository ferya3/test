<?php

declare(strict_types=1);

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Support\Facades\Hash;

/**
 * The seeded accounts are created at @example.com, and correcting that through
 * the panel needs an account you can already sign in to — so the first change
 * has to be possible from the command line.
 */
it('changes the address of an existing account', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.com']);

    $this->artisan('user:email', [
        'current' => 'admin@example.com',
        'new' => 'info@artavilgold.com',
    ])->assertSuccessful();

    expect($user->fresh()->email)->toBe('info@artavilgold.com');
});

it('leaves the password alone', function (): void {
    // Renaming an account must not silently invalidate its credentials.
    $user = User::factory()->create([
        'email' => 'admin@example.com',
        'password' => 'Correct-Horse-9!',
    ]);

    $this->artisan('user:email', [
        'current' => 'admin@example.com',
        'new' => 'info@artavilgold.com',
    ])->assertSuccessful();

    expect(Hash::check('Correct-Horse-9!', $user->fresh()->password))->toBeTrue();
});

it('refuses an address another account already holds', function (): void {
    User::factory()->create(['email' => 'taken@artavilgold.com']);
    $user = User::factory()->create(['email' => 'admin@example.com']);

    $this->artisan('user:email', [
        'current' => 'admin@example.com',
        'new' => 'taken@artavilgold.com',
    ])->assertFailed();

    expect($user->fresh()->email)->toBe('admin@example.com');
});

it('refuses something that is not an address', function (): void {
    $user = User::factory()->create(['email' => 'admin@example.com']);

    $this->artisan('user:email', ['current' => 'admin@example.com', 'new' => 'not-an-email'])
        ->assertFailed();

    expect($user->fresh()->email)->toBe('admin@example.com');
});

it('lists the accounts when the current address is wrong', function (): void {
    User::factory()->create(['email' => 'real@example.com']);

    $this->artisan('user:email', ['current' => 'typo@example.com', 'new' => 'new@artavilgold.com'])
        ->expectsOutputToContain('real@example.com')
        ->assertFailed();
});

it('keeps the roles attached across the rename', function (): void {
    $this->seed(RolePermissionSeeder::class);
    $user = User::factory()->admin()->create(['email' => 'admin@example.com']);

    $this->artisan('user:email', ['current' => 'admin@example.com', 'new' => 'info@artavilgold.com'])
        ->assertSuccessful();

    expect($user->fresh()->hasRole('admin'))->toBeTrue();
});
