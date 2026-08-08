<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\Enums\RoleName;
use App\Support\Permissions;
use Database\Seeders\RolePermissionSeeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

beforeEach(function (): void {
    $this->seed(RolePermissionSeeder::class);
});

it('creates every role', function (): void {
    foreach (RoleName::cases() as $role) {
        expect(Role::where('name', $role->value)->exists())->toBeTrue();
    }
});

it('creates every permission in the matrix', function (): void {
    expect(Permission::count())->toBe(count(Permissions::all()));
});

it('grants super admin every ability without explicit permissions', function (): void {
    $user = User::factory()->superAdmin()->create();

    // Deliberately holds no direct permissions — a Gate::before rule covers it,
    // so resources added later need no re-seed.
    expect($user->getAllPermissions())->toBeEmpty()
        ->and($user->can('products.create'))->toBeTrue()
        ->and($user->can('users.delete'))->toBeTrue()
        ->and($user->can('some.future.resource'))->toBeTrue();
});

it('denies a deactivated super admin everything', function (): void {
    $user = User::factory()->superAdmin()->inactive()->create();

    expect($user->can('products.create'))->toBeFalse();
});

it('withholds user and role management from an admin', function (): void {
    $user = User::factory()->admin()->create();

    expect($user->can('products.create'))->toBeTrue()
        ->and($user->can('settings.update'))->toBeTrue()
        ->and($user->can('users.create'))->toBeFalse()
        ->and($user->can('roles.create'))->toBeFalse();
});

it('limits an editor to content, not the catalogue', function (): void {
    $user = User::factory()->editor()->create();

    expect($user->can('articles.create'))->toBeTrue()
        ->and($user->can('pages.update'))->toBeTrue()
        ->and($user->can('media.create'))->toBeTrue()
        ->and($user->can('products.create'))->toBeFalse()
        ->and($user->can('colors.update'))->toBeFalse()
        ->and($user->can('users.viewAny'))->toBeFalse();
});

it('lets an editor read leads but not triage them', function (): void {
    $user = User::factory()->editor()->create();

    expect($user->can('contact-requests.viewAny'))->toBeTrue()
        ->and($user->can('contact-requests.update'))->toBeFalse()
        ->and($user->can('contact-requests.delete'))->toBeFalse();
});

it('limits a product manager to the catalogue, not editorial content', function (): void {
    $user = User::factory()->productManager()->create();

    expect($user->can('products.create'))->toBeTrue()
        ->and($user->can('categories.update'))->toBeTrue()
        ->and($user->can('thicknesses.delete'))->toBeTrue()
        ->and($user->can('contact-requests.update'))->toBeTrue()
        ->and($user->can('articles.create'))->toBeFalse()
        ->and($user->can('pages.update'))->toBeFalse();
});

it('grants no abilities to a user with no role', function (): void {
    $user = User::factory()->create();

    expect($user->can('products.viewAny'))->toBeFalse()
        ->and($user->canAccessAdminPanel())->toBeFalse();
});

it('never issues create or delete permissions for lead resources', function (): void {
    // Leads arrive from the public site; nobody authors them in the panel.
    expect(Permissions::all())
        ->not->toContain('contact-requests.create')
        ->not->toContain('catalog-requests.create');
});

it('requires two factor authentication only for privileged roles', function (): void {
    expect(User::factory()->superAdmin()->create()->requiresTwoFactor())->toBeTrue()
        ->and(User::factory()->admin()->create()->requiresTwoFactor())->toBeTrue()
        ->and(User::factory()->editor()->create()->requiresTwoFactor())->toBeFalse()
        ->and(User::factory()->productManager()->create()->requiresTwoFactor())->toBeFalse();
});

it('encrypts the two factor secret at rest', function (): void {
    $user = User::factory()->withTwoFactor('MYTOTPSECRET1234')->create();

    $stored = DB::table('users')->where('id', $user->id)->value('two_factor_secret');

    expect($stored)->not->toBe('MYTOTPSECRET1234')
        ->and($user->fresh()->two_factor_secret)->toBe('MYTOTPSECRET1234');
});

it('consumes a recovery code exactly once', function (): void {
    $user = User::factory()->withTwoFactor()->create();
    $code = $user->two_factor_recovery_codes[0];

    expect($user->useRecoveryCode($code))->toBeTrue()
        ->and($user->useRecoveryCode($code))->toBeFalse()
        ->and($user->fresh()->two_factor_recovery_codes)->toHaveCount(7);
});

it('rejects an unknown recovery code', function (): void {
    $user = User::factory()->withTwoFactor()->create();

    expect($user->useRecoveryCode('NOTAREALCODE'))->toBeFalse()
        ->and($user->fresh()->two_factor_recovery_codes)->toHaveCount(8);
});

it('hides credentials from serialisation', function (): void {
    $user = User::factory()->withTwoFactor()->create()->toArray();

    expect($user)->not->toHaveKeys([
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ]);
});
