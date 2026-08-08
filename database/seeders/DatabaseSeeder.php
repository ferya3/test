<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Catalog;
use App\Models\CatalogRequest;
use App\Models\ContactRequest;
use App\Models\Product;
use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Order matters: roles before users, attributes before products,
        // products before the projects that reference them.
        $this->call([
            RolePermissionSeeder::class,
            AdminUserSeeder::class,
            SettingSeeder::class,
            AttributeSeeder::class,
            CategorySeeder::class,
            ProductSeeder::class,
            PageSeeder::class,
            ArticleSeeder::class,
            ShowcaseSeeder::class,
            RepresentativeSeeder::class,
        ]);

        if (app()->environment('local', 'testing')) {
            $this->seedDemoLeads();
        }
    }

    /**
     * Sample enquiries so the admin inbox is not empty in local development.
     */
    private function seedDemoLeads(): void
    {
        if (ContactRequest::query()->exists()) {
            return;
        }

        $products = Product::query()->inRandomOrder()->limit(4)->pluck('id');

        foreach (ContactRequestType::cases() as $type) {
            ContactRequest::factory()
                ->count(3)
                ->ofType($type)
                ->create(['product_id' => $type === ContactRequestType::Quote ? $products->first() : null]);
        }

        ContactRequest::factory()->count(2)->withStatus(LeadStatus::InProgress)->create();
        ContactRequest::factory()->count(2)->withStatus(LeadStatus::Closed)->create();

        Catalog::query()->get()->each(
            fn (Catalog $catalog) => CatalogRequest::factory()
                ->count(2)
                ->create(['catalog_id' => $catalog->getKey()]),
        );
    }
}
