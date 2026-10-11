<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Catalog;
use App\Models\CatalogRequest;
use App\Models\Certificate;
use App\Models\Company;
use App\Models\ContactRequest;
use App\Models\Product;
use App\Models\Project;
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
            $this->seedDemoCompanies();
        }
    }

    /**
     * Five placeholder subsidiaries, so the holding pages have something to
     * render in local development. Never seeded in production: invented
     * companies on a live site would be worse than none, and the real five are
     * entered in the admin.
     *
     * The existing panel catalogue goes to the first one, which is what the
     * single-factory site this grew out of actually is.
     */
    private function seedDemoCompanies(): void
    {
        if (Company::query()->exists()) {
            return;
        }

        $companies = Company::factory()
            ->count(5)
            ->sequence(fn ($sequence): array => ['position' => $sequence->index])
            ->create();

        $first = $companies->first()->getKey();

        Product::query()->whereNull('company_id')->update(['company_id' => $first]);
        Project::query()->whereNull('company_id')->update(['company_id' => $first]);
        Certificate::query()->whereNull('company_id')->update(['company_id' => $first]);
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
