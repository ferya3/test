<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * Creating a record with the ordering field left blank.
 *
 * `position` is NOT NULL DEFAULT 0. A blank input arrives as null, the insert
 * names the column explicitly, and MySQL refuses it — every create form in the
 * panel returned a 500 for anyone who did not type a number into a field they
 * had no opinion about.
 *
 * The suite could not have caught it before: SQLite is the test database, and
 * every factory supplies a position.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, CategorySeeder::class]);

    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);
});

it('creates a product when the ordering is left blank', function (): void {
    $this->post('/admin/products', [
        'code' => 'AG-12000',
        'name' => ['fa' => 'صفحه کابینت ۱۲۰۰۰', 'en' => 'Cabinet Panel 12000'],
        'category_id' => (string) Category::query()->value('id'),
        'decor_family' => 'wood',
        'position' => null,
        'is_active' => '1',
    ])->assertRedirect();

    $product = Product::query()->where('code', 'AG-12000')->firstOrFail();

    expect($product->position)->toBe(0);
});

it('keeps an ordering that was given', function (): void {
    $this->post('/admin/products', [
        'code' => 'AG-12001',
        'name' => ['fa' => 'دومی', 'en' => 'Second'],
        'category_id' => (string) Category::query()->value('id'),
        'position' => '7',
        'is_active' => '1',
    ])->assertRedirect();

    expect(Product::query()->where('code', 'AG-12001')->value('position'))->toBe(7);
});

it('normalises a blank position on every model that carries one', function (): void {
    // The mutator is shared rather than repeated, so this covers the lookup
    // tables and the four models that order themselves without being one.
    foreach ([Color::class, Decor::class, Category::class] as $model) {
        $record = new $model;
        $record->position = null;

        expect($record->position)->toBe(0, $model.' left a null position');
    }
});
