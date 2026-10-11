<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use App\Support\Permissions;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class]);
});

function signInAs(User $user): void
{
    test()->actingAs($user);
    session([RequireTwoFactor::SESSION_KEY => time()]);
}

it('lets an admin create a company', function (): void {
    signInAs(User::factory()->admin()->create());

    $this->post('/admin/companies', [
        'name' => ['fa' => 'صنایع رزین', 'en' => 'Resin Industries'],
        'accent_hex' => '#5B7B3A',
        'employees' => '250',
        'is_active' => '1',
    ])->assertRedirect();

    $company = Company::query()->firstOrFail();

    expect($company->slug)->toBe('resin-industries')
        ->and($company->accent_hex)->toBe('#5B7B3A')
        ->and($company->employees)->toBe(250);
});

it('rejects an accent that is not a hex colour', function (): void {
    signInAs(User::factory()->admin()->create());

    $this->post('/admin/companies', [
        'name' => ['fa' => 'صنایع رزین'],
        'accent_hex' => 'red; background: url(x)',
    ])->assertSessionHasErrors('accent_hex');

    expect(Company::query()->count())->toBe(0);
});

it('lets an editor update a company profile but not create or delete one', function (): void {
    $company = Company::factory()->create();
    signInAs(User::factory()->editor()->create());

    $this->get("/admin/companies/{$company->id}/edit")->assertOk();
    $this->put("/admin/companies/{$company->id}", ['name' => ['fa' => 'نام تازه']])->assertRedirect();
    $this->get('/admin/companies/create')->assertForbidden();
    $this->delete("/admin/companies/{$company->id}")->assertForbidden();

    expect($company->fresh()->translate('name', 'fa'))->toBe('نام تازه');
});

it('keeps a product manager out of the companies screen', function (): void {
    signInAs(User::factory()->productManager()->create());

    $this->get('/admin/companies')->assertForbidden();
});

it('files a product under a subsidiary from the product form', function (): void {
    $company = Company::factory()->create(['name' => ['fa' => 'صنایع پنل']]);
    $product = Product::factory()->create();
    signInAs(User::factory()->superAdmin()->create());

    $this->get("/admin/products/{$product->id}/edit")
        ->assertOk()
        ->assertSee('name="company_id"', escape: false)
        ->assertSee('صنایع پنل');

    $this->put("/admin/products/{$product->id}", [
        'code' => $product->code,
        'name' => ['fa' => 'پنل'],
        'category_id' => $product->category_id,
        'company_id' => $company->id,
    ])->assertRedirect();

    expect($product->fresh()->company_id)->toBe($company->id);
});

it('refuses a company that does not exist', function (): void {
    $product = Product::factory()->create();
    signInAs(User::factory()->superAdmin()->create());

    $this->put("/admin/products/{$product->id}", [
        'code' => $product->code,
        'name' => ['fa' => 'پنل'],
        'category_id' => $product->category_id,
        'company_id' => 999999,
    ])->assertSessionHasErrors('company_id');
});

it('hands a deleted company\'s products back to the holding instead of deleting them', function (): void {
    $company = Company::factory()->create();
    $product = Product::factory()->create(['company_id' => $company->id]);

    $company->delete();

    expect($product->fresh())->not->toBeNull()
        ->and($product->fresh()->company_id)->toBeNull();
});

it('creates the companies permissions in the migration, so an install that is never re-seeded keeps a working admin', function (): void {
    /*
     * deploy.sh migrates and does not seed. The sidebar asks every resource's
     * policy whether to show its link, and spatie throws for a permission that
     * does not exist — so without the migration, every admin page would 500
     * for every role below Super Admin.
     */
    Permission::query()->where('name', 'like', 'companies.%')->delete();
    app(PermissionRegistrar::class)->forgetCachedPermissions();

    $migration = require database_path('migrations/2026_10_11_000003_grant_company_permissions.php');
    $migration->up();

    foreach (Permissions::matrix()['companies'] as $ability) {
        expect(Permission::query()->where('name', "companies.{$ability}")->exists())->toBeTrue();
    }

    expect(Role::findByName('admin')->hasPermissionTo('companies.create'))->toBeTrue()
        ->and(Role::findByName('editor')->hasPermissionTo('companies.update'))->toBeTrue()
        ->and(Role::findByName('editor')->hasPermissionTo('companies.create'))->toBeFalse();

    signInAs(User::factory()->editor()->create());
    $this->get('/admin')->assertOk();
});
