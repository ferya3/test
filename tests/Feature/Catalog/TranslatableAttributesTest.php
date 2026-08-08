<?php

declare(strict_types=1);

use App\Models\Category;
use App\Models\Product;

it('returns the value for the active locale', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'پنل کابینت', 'en' => 'Cabinet Panels'],
    ]);

    app()->setLocale('fa');
    expect($category->name)->toBe('پنل کابینت');

    app()->setLocale('en');
    expect($category->name)->toBe('Cabinet Panels');
});

it('falls back to another locale when the active one is missing', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'فقط فارسی'],
    ]);

    app()->setLocale('en');

    // English is absent, so the Persian default is served rather than an empty heading.
    expect($category->name)->toBe('فقط فارسی');
});

it('treats an empty string as a missing translation', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'مقدار فارسی', 'en' => ''],
    ]);

    app()->setLocale('en');

    expect($category->name)->toBe('مقدار فارسی');
});

it('returns null when no translation exists at all', function (): void {
    $category = Category::factory()->create(['description' => null]);

    expect($category->description)->toBeNull();
});

it('records a bare string assignment against the active locale', function (): void {
    app()->setLocale('en');

    $category = Category::factory()->create(['name' => 'Assigned In English']);

    expect($category->getTranslations('name'))->toBe(['en' => 'Assigned In English']);
});

it('reads and writes individual translations without disturbing the others', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'اولیه', 'en' => 'Initial'],
    ]);

    $category->setTranslation('name', 'en', 'Updated')->save();

    expect($category->fresh()->getTranslations('name'))
        ->toBe(['fa' => 'اولیه', 'en' => 'Updated']);
});

it('removes a translation when set to null', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'فارسی', 'en' => 'English'],
    ]);

    $category->setTranslation('name', 'en', null)->save();

    expect($category->fresh()->getTranslations('name'))->toBe(['fa' => 'فارسی']);
});

it('persists Persian text without unicode escaping', function (): void {
    $product = Product::factory()->create(['name' => ['fa' => 'پنل های‌گلاس']]);

    $stored = DB::table('products')->where('id', $product->id)->value('name');

    expect($stored)->toContain('پنل های‌گلاس');
});

it('reports which locales carry a translation', function (): void {
    $category = Category::factory()->create([
        'name' => ['fa' => 'نام', 'en' => 'Name'],
        'description' => ['fa' => 'توضیح'],
    ]);

    expect($category->translatedLocales())->toEqualCanonicalizing(['fa', 'en']);
});
