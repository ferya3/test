<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Category;
use App\Models\ContactRequest;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class]);
});

/**
 * Signs in and clears the two-factor gate, so these tests exercise policies
 * rather than re-testing the gate.
 */
function actingAsAdmin(User $user): User
{
    test()->actingAs($user);
    session([RequireTwoFactor::SESSION_KEY => time()]);

    return $user;
}

describe('product manager', function (): void {
    beforeEach(function (): void {
        $this->user = actingAsAdmin(User::factory()->productManager()->create());
    });

    it('reaches the catalogue', function (): void {
        $this->get('/admin/products')->assertOk();
        $this->get('/admin/categories')->assertOk();
        $this->get('/admin/colors')->assertOk();
        $this->get('/admin/thicknesses')->assertOk();
    });

    it('is refused editorial content', function (): void {
        $this->get('/admin/articles')->assertForbidden();
        $this->get('/admin/pages')->assertForbidden();
        $this->get('/admin/projects')->assertForbidden();
    });

    it('is refused user administration', function (): void {
        $this->get('/admin/users')->assertForbidden();
        $this->get('/admin/settings')->assertForbidden();
    });

    it('may triage leads', function (): void {
        $this->get('/admin/leads')->assertOk();
    });

    it('may create a product', function (): void {
        $this->get('/admin/products/create')->assertOk();
    });
});

describe('editor', function (): void {
    beforeEach(function (): void {
        $this->user = actingAsAdmin(User::factory()->editor()->create());
    });

    it('reaches editorial content', function (): void {
        $this->get('/admin/articles')->assertOk();
        $this->get('/admin/projects')->assertOk();
        $this->get('/admin/certificates')->assertOk();
        $this->get('/admin/media')->assertOk();
    });

    it('is refused the catalogue', function (): void {
        $this->get('/admin/products')->assertForbidden();
        $this->get('/admin/colors')->assertForbidden();
    });

    it('may read leads but not change them', function (): void {
        $this->get('/admin/leads')->assertOk();

        $lead = ContactRequest::factory()->create();

        $this->put("/admin/leads/{$lead->id}", ['status' => 'closed'])->assertForbidden();
    });

    it('is refused user administration', function (): void {
        $this->get('/admin/users')->assertForbidden();
    });
});

describe('admin', function (): void {
    beforeEach(function (): void {
        $this->user = actingAsAdmin(User::factory()->admin()->create());
    });

    it('reaches the catalogue and editorial content', function (): void {
        $this->get('/admin/products')->assertOk();
        $this->get('/admin/articles')->assertOk();
        $this->get('/admin/settings')->assertOk();
    });

    it('is refused user administration', function (): void {
        // An Admin who could grant roles could grant themselves Super Admin,
        // which would make the distinction meaningless.
        $this->get('/admin/users')->assertForbidden();
    });
});

describe('super admin', function (): void {
    beforeEach(function (): void {
        $this->user = actingAsAdmin(User::factory()->superAdmin()->create());
    });

    it('reaches everything', function (): void {
        foreach ([
            '/admin',
            '/admin/products',
            '/admin/categories',
            '/admin/articles',
            '/admin/projects',
            '/admin/media',
            '/admin/leads',
            '/admin/catalog-requests',
            '/admin/users',
            '/admin/settings',
        ] as $path) {
            $this->get($path)->assertOk();
        }
    });

    it('holds no explicit permissions, relying on the Gate::before rule', function (): void {
        expect($this->user->getAllPermissions())->toBeEmpty();
    });
});

describe('write protection', function (): void {
    it('refuses a store from a role without the create permission', function (): void {
        actingAsAdmin(User::factory()->editor()->create());

        $this->post('/admin/products', [
            'code' => 'PNL-X',
            'name' => ['fa' => 'تست'],
            'category_id' => Category::first()->id,
        ])->assertForbidden();

        expect(Product::where('code', 'PNL-X')->exists())->toBeFalse();
    });

    it('refuses a delete from a role without the delete permission', function (): void {
        $product = Product::factory()->create();

        actingAsAdmin(User::factory()->editor()->create());

        $this->delete("/admin/products/{$product->id}")->assertForbidden();

        expect($product->fresh())->not->toBeNull();
    });

    it('refuses a user update from an admin', function (): void {
        $target = User::factory()->editor()->create();

        actingAsAdmin(User::factory()->admin()->create());

        $this->put("/admin/users/{$target->id}", [
            'name' => 'Escalated',
            'email' => $target->email,
            'role' => 'super-admin',
        ])->assertForbidden();

        expect($target->fresh()->hasRole('super-admin'))->toBeFalse();
    });
});

describe('navigation', function (): void {
    it('hides links a role cannot open', function (): void {
        actingAsAdmin(User::factory()->editor()->create());

        $html = $this->get('/admin')->assertOk()->getContent();

        // A link that leads straight to a 403 is worse than no link.
        expect($html)->toContain(__('admin.resources.articles'))
            ->not->toContain('/admin/products')
            ->not->toContain('/admin/users');
    });

    it('shows the catalogue to a product manager', function (): void {
        actingAsAdmin(User::factory()->productManager()->create());

        $html = $this->get('/admin')->assertOk()->getContent();

        expect($html)->toContain('/admin/products')
            ->not->toContain('/admin/articles');
    });
});
