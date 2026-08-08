<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Application;
use App\Models\Article;
use App\Models\Category;
use App\Models\Color;
use App\Models\Product;
use App\Models\Thickness;
use App\Models\User;
use App\Support\Enums\ArticleStatus;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class]);

    $this->actingAs(User::factory()->superAdmin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);
});

describe('writes', function (): void {
    it('creates a product and redirects to its edit form', function (): void {
        $category = Category::query()->first();

        $response = $this->post('/admin/products', [
            'code' => 'PNL-CRUD-1',
            'name' => ['fa' => 'پانل آزمایشی', 'en' => 'Test Panel'],
            'category_id' => $category->id,
            'is_active' => '1',
        ]);

        $product = Product::query()->where('code', 'PNL-CRUD-1')->first();

        expect($product)->not->toBeNull()
            ->and($product->translate('name', 'fa'))->toBe('پانل آزمایشی')
            ->and($product->translate('name', 'en'))->toBe('Test Panel')
            ->and($product->is_active)->toBeTrue();

        $response->assertRedirect("/admin/products/{$product->id}/edit");
    });

    it('updates a product', function (): void {
        $product = Product::factory()->create(['code' => 'PNL-CRUD-2']);

        $this->put("/admin/products/{$product->id}", [
            'code' => 'PNL-CRUD-2-EDITED',
            'name' => ['fa' => 'ویرایش شده'],
            'category_id' => $product->category_id,
        ])->assertRedirect("/admin/products/{$product->id}/edit");

        expect($product->fresh()->code)->toBe('PNL-CRUD-2-EDITED')
            ->and($product->fresh()->translate('name', 'fa'))->toBe('ویرایش شده');
    });

    it('deletes a product', function (): void {
        $product = Product::factory()->create();

        $this->delete("/admin/products/{$product->id}")->assertRedirect('/admin/products');

        expect(Product::query()->find($product->id))->toBeNull();
    });

    it('syncs a many-to-many relation instead of mass assigning it', function (): void {
        $product = Product::factory()->create();
        $thicknesses = Thickness::query()->limit(2)->pluck('id');
        $applications = Application::query()->limit(2)->pluck('id');

        $this->put("/admin/products/{$product->id}", [
            'code' => $product->code,
            'name' => ['fa' => 'با روابط'],
            'category_id' => $product->category_id,
            'thicknesses' => $thicknesses->all(),
            'applications' => $applications->all(),
        ])->assertRedirect();

        expect($product->fresh()->thicknesses->pluck('id')->sort()->values()->all())
            ->toBe($thicknesses->sort()->values()->all())
            ->and($product->fresh()->applications->pluck('id')->sort()->values()->all())
            ->toBe($applications->sort()->values()->all());
    });

    it('replaces rather than appends on a second relation sync', function (): void {
        $product = Product::factory()->create();
        $all = Thickness::query()->limit(3)->pluck('id');

        foreach ([$all->all(), [$all->first()]] as $selection) {
            $this->put("/admin/products/{$product->id}", [
                'code' => $product->code,
                'name' => ['fa' => 'تست'],
                'category_id' => $product->category_id,
                'thicknesses' => $selection,
            ]);
        }

        expect($product->fresh()->thicknesses)->toHaveCount(1);
    });

    it('leaves a relation untouched when the field is absent from the payload', function (): void {
        // A partial submission must not silently detach everything.
        $product = Product::factory()->create();
        $product->thicknesses()->sync(Thickness::query()->limit(2)->pluck('id')->all());

        $this->put("/admin/products/{$product->id}", [
            'code' => $product->code,
            'name' => ['fa' => 'بدون ضخامت'],
            'category_id' => $product->category_id,
        ]);

        expect($product->fresh()->thicknesses)->toHaveCount(2);
    });
});

describe('validation', function (): void {
    it('rejects a product with no name in the default locale', function (): void {
        $this->post('/admin/products', [
            'code' => 'PNL-INVALID',
            'name' => ['en' => 'English only'],
            'category_id' => Category::query()->first()->id,
        ])->assertSessionHasErrors('name');

        expect(Product::query()->where('code', 'PNL-INVALID')->exists())->toBeFalse();
    });

    it('rejects a duplicate product code', function (): void {
        $existing = Product::factory()->create();

        $this->post('/admin/products', [
            'code' => $existing->code,
            'name' => ['fa' => 'تکراری'],
            'category_id' => $existing->category_id,
        ])->assertSessionHasErrors('code');
    });

    it('rejects a category that does not exist', function (): void {
        $this->post('/admin/products', [
            'code' => 'PNL-NO-CAT',
            'name' => ['fa' => 'بدون دسته'],
            'category_id' => 999999,
        ])->assertSessionHasErrors('category_id');
    });

    it('rejects a value outside a select field enum', function (): void {
        // The options are rendered from the enum; the rules must come from the
        // same place, or the select is decorative and the column takes anything.
        $color = Color::query()->first();

        $this->put("/admin/colors/{$color->id}", [
            'name' => ['fa' => $color->translate('name', 'fa')],
            'hex' => '#123456',
            'color_family' => 'not-a-real-family',
        ])->assertSessionHasErrors('color_family');

        expect($color->fresh()->color_family?->value)->not->toBe('not-a-real-family');
    });

    it('rejects a value outside a required enum', function (): void {
        $article = Article::factory()->create(['status' => ArticleStatus::Draft]);

        $this->put("/admin/articles/{$article->id}", [
            'title' => ['fa' => 'عنوان'],
            'body' => ['fa' => 'متن'],
            'status' => 'deleted-by-hand',
        ])->assertSessionHasErrors('status');

        expect($article->fresh()->status)->toBe(ArticleStatus::Draft);
    });

    it('rejects a malformed colour value', function (): void {
        $color = Color::query()->first();

        $this->put("/admin/colors/{$color->id}", [
            'name' => ['fa' => 'رنگ'],
            'hex' => 'javascript:alert(1)',
        ])->assertSessionHasErrors('hex');
    });

    it('ignores a field that was never declared', function (): void {
        // Only declared fields are mass assigned, so an extra key in the
        // payload cannot reach a column that is not on the form.
        $product = Product::factory()->create(['view_count' => 7]);

        $this->put("/admin/products/{$product->id}", [
            'code' => $product->code,
            'name' => ['fa' => 'تست'],
            'category_id' => $product->category_id,
            'view_count' => 99999,
        ]);

        expect($product->fresh()->view_count)->toBe(7);
    });
});
