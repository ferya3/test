<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\CrudController;
use App\Http\Middleware\RequireTwoFactor;
use App\Models\CatalogRequest;
use App\Models\ContactRequest;
use App\Models\User;
use Database\Seeders\ArticleSeeder;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PageSeeder;
use Database\Seeders\ProductSeeder;
use Database\Seeders\RepresentativeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;
use Database\Seeders\ShowcaseSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

/**
 * Renders every admin screen against seeded content.
 *
 * The authorisation tests hit the same URLs, but with an empty database — so a
 * list page that fatals on the *contents* of a row still returns 200 to them.
 * Three index pages shipped broken behind exactly that blind spot: a column
 * cast to a backed enum cannot be stringified, and nothing rendered an enum
 * until there was a row to render.
 */
beforeEach(function (): void {
    $this->seed([
        RolePermissionSeeder::class,
        SettingSeeder::class,
        AttributeSeeder::class,
        CategorySeeder::class,
        ProductSeeder::class,
        PageSeeder::class,
        ArticleSeeder::class,
        ShowcaseSeeder::class,
        RepresentativeSeeder::class,
    ]);

    ContactRequest::factory()->count(3)->create();
    CatalogRequest::factory()->count(2)->create();

    $this->actingAs(User::factory()->superAdmin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);
});

/**
 * Discovered from the router rather than listed by hand, so a resource added
 * later is covered without anyone remembering to extend this test.
 *
 * @return array<string, class-string<CrudController>>
 */
function crudResources(): array
{
    $resources = [];

    foreach (Route::getRoutes() as $route) {
        $name = (string) $route->getName();

        if (! str_starts_with($name, 'admin.') || ! str_ends_with($name, '.index')) {
            continue;
        }

        $controller = Str::before($route->getActionName(), '@');

        if (is_subclass_of($controller, CrudController::class)) {
            $resources[Str::between($name, 'admin.', '.index')] = $controller;
        }
    }

    ksort($resources);

    return $resources;
}

/**
 * The model a CRUD controller manages. Protected because nothing in the
 * application needs it from outside; the test reads it reflectively rather
 * than widening the API for the sake of being testable.
 *
 * @param  class-string<CrudController>  $controller
 * @return class-string<Model>
 */
function modelOf(string $controller): string
{
    return (new ReflectionMethod($controller, 'model'))->invoke(app($controller));
}

it('discovers every CRUD resource', function (): void {
    // Guards the discovery itself: if the router shape changes and this returns
    // nothing, the tests below would all pass vacuously.
    expect(crudResources())->toHaveCount(15)
        ->toHaveKeys(['products', 'articles', 'pages', 'projects', 'categories']);
});

it('renders each resource index with rows in it', function (): void {
    foreach (crudResources() as $slug => $controller) {
        $model = modelOf($controller);

        expect($model::query()->count())
            ->toBeGreaterThan(0, "no seeded rows for {$slug}, so its index proves nothing");

        $this->get("/admin/{$slug}")->assertOk();
    }
});

it('renders each resource edit form for a real record', function (): void {
    foreach (crudResources() as $slug => $controller) {
        $record = modelOf($controller)::query()->first();

        $this->get("/admin/{$slug}/{$record->getKey()}/edit")
            ->assertOk()
            ->assertSee('name="_token"', escape: false);
    }
});

it('renders each resource create form', function (): void {
    foreach (crudResources() as $slug => $controller) {
        // Pages back fixed routes and cannot be created, which the controller
        // expresses as a 404 rather than a hidden button.
        $expected = $slug === 'pages' ? 404 : 200;

        $this->get("/admin/{$slug}/create")->assertStatus($expected);
    }
});

it('renders the non-CRUD screens with content', function (): void {
    foreach (['/admin', '/admin/media', '/admin/leads', '/admin/catalog-requests', '/admin/users', '/admin/settings'] as $path) {
        $this->get($path)->assertOk();
    }

    $lead = ContactRequest::query()->first();

    $this->get("/admin/leads/{$lead->id}")->assertOk();
});

it('shows an enum column as its label, not its raw case', function (): void {
    // The specific bug: `published` leaking through, or a 500 where a label
    // should be.
    $this->get('/admin/articles')
        ->assertOk()
        ->assertSee(__('enums.article_status.published'));
});
