<?php

declare(strict_types=1);

use App\Models\Article;
use App\Models\Company;
use App\Models\Product;
use App\Support\Enums\ArticleStatus;
use Database\Seeders\PageSeeder;
use Database\Seeders\SettingSeeder;

/**
 * The holding's public face: the subsidiaries index, one page per company,
 * and the places the rest of the site points at them.
 */
beforeEach(function (): void {
    $this->seed([SettingSeeder::class, PageSeeder::class]);
});

describe('the companies index', function (): void {
    it('lists the active subsidiaries in their editorial order', function (): void {
        Company::factory()->create(['name' => ['fa' => 'شرکت دوم'], 'position' => 2]);
        Company::factory()->create(['name' => ['fa' => 'شرکت اول'], 'position' => 1]);
        Company::factory()->inactive()->create(['name' => ['fa' => 'شرکت پنهان']]);

        $html = $this->get('/companies')->assertOk()->getContent();

        expect($html)->toContain('شرکت اول')
            ->toContain('شرکت دوم')
            ->not->toContain('شرکت پنهان')
            ->and(strpos($html, 'شرکت اول'))->toBeLessThan(strpos($html, 'شرکت دوم'));
    });

    it('totals the figures the subsidiaries report, and omits the ones nobody entered', function (): void {
        Company::factory()->create(['employees' => 1200, 'site_area_sqm' => null]);
        Company::factory()->create(['employees' => 300, 'site_area_sqm' => null]);

        $html = $this->get('/companies')->assertOk()->getContent();

        expect($html)->toContain('1,500')
            ->toContain(__('pages.companies.total_employees', [], 'fa'))
            ->not->toContain(__('pages.companies.total_area', [], 'fa'));
    });

    it('says the list is coming rather than rendering an empty grid', function (): void {
        $this->get('/companies')
            ->assertOk()
            ->assertSee(__('pages.companies.empty', [], 'fa'));
    });

    it('declares the subsidiaries as sub-organisations of the group', function (): void {
        $company = Company::factory()->create();

        $this->get('/companies')
            ->assertOk()
            ->assertSee('"subOrganization"', escape: false)
            ->assertSee("companies\/{$company->slug}#organization", escape: false);
    });
});

describe('a company page', function (): void {
    it('shows the company with its own products and nobody else\'s', function (): void {
        $company = Company::factory()->create(['name' => ['fa' => 'صنایع نمونه']]);
        $other = Company::factory()->create();

        $own = Product::factory()->create(['company_id' => $company->id, 'name' => ['fa' => 'محصول خودی']]);
        $foreign = Product::factory()->create(['company_id' => $other->id, 'name' => ['fa' => 'محصول دیگری']]);
        $holding = Product::factory()->create(['company_id' => null, 'name' => ['fa' => 'محصول هلدینگ']]);

        $this->get("/companies/{$company->slug}")
            ->assertOk()
            ->assertSee('صنایع نمونه')
            ->assertSee('محصول خودی')
            ->assertDontSee('محصول دیگری')
            ->assertDontSee('محصول هلدینگ');
    });

    it('lists only published articles that belong to the company', function (): void {
        $company = Company::factory()->create();

        Article::factory()->create([
            'company_id' => $company->id,
            'title' => ['fa' => 'خبر منتشرشده'],
            'status' => ArticleStatus::Published,
            'published_at' => now()->subDay(),
        ]);
        Article::factory()->create([
            'company_id' => $company->id,
            'title' => ['fa' => 'پیش‌نویس'],
            'status' => ArticleStatus::Draft,
        ]);

        $this->get("/companies/{$company->slug}")
            ->assertOk()
            ->assertSee('خبر منتشرشده')
            ->assertDontSee('پیش‌نویس');
    });

    it('is not found while the company is inactive', function (): void {
        $company = Company::factory()->inactive()->create();

        $this->get("/companies/{$company->slug}")->assertNotFound();
    });

    it('carries the company accent as a custom property', function (): void {
        $company = Company::factory()->create(['accent_hex' => '#2F6F8F']);

        $this->get("/companies/{$company->slug}")
            ->assertOk()
            ->assertSee('--company-accent: #2F6F8F;', escape: false);
    });

    it('describes the company as an organisation belonging to the group', function (): void {
        $company = Company::factory()->create(['founded_year' => 1998, 'employees' => 420]);

        $this->get("/companies/{$company->slug}")
            ->assertOk()
            ->assertSee('"parentOrganization":{"@id":"http:\/\/localhost#organization"}', escape: false)
            ->assertSee('"foundingDate":"1998"', escape: false)
            ->assertSee('"numberOfEmployees"', escape: false);
    });

    it('links to the other group companies but not to itself', function (): void {
        $company = Company::factory()->create();
        $sibling = Company::factory()->create();

        $html = $this->get("/companies/{$company->slug}")->assertOk()->getContent();

        // Card headings carry the company id; the page's own canonical and
        // hreflang links naturally point at itself, so those are not the test.
        expect($html)->toContain('id="company-'.$sibling->id.'"')
            ->not->toContain('id="company-'.$company->id.'"');
    });

    it('renders in English under /en', function (): void {
        $company = Company::factory()->create(['name' => ['fa' => 'صنایع نمونه', 'en' => 'Sample Industries']]);

        $this->get("/en/companies/{$company->slug}")
            ->assertOk()
            ->assertSee('Sample Industries')
            ->assertSee('dir="ltr"', escape: false);
    });
});

describe('the accent', function (): void {
    it('refuses anything but a six-digit hex, however it reached the column', function (string $value): void {
        $company = Company::factory()->make(['accent_hex' => $value]);

        expect($company->accentStyle())->toBeNull();
    })->with([
        'a closing declaration' => ['#fff; x'],
        'a named colour' => ['red'],
        'three digits' => ['#abc'],
    ]);

    it('accepts a valid one', function (): void {
        expect(Company::factory()->make(['accent_hex' => '#B4541A'])->accentStyle())
            ->toBe('--company-accent: #B4541A;');
    });
});

describe('the holding flag', function (): void {
    it('keeps the companies out of the header, footer, homepage and sitemap while off', function (): void {
        config(['features.holding' => false]);
        $company = Company::factory()->create(['name' => ['fa' => 'صنایع نمونه']]);

        $html = $this->get('/')->assertOk()->getContent();

        expect($html)->not->toContain('href="http://localhost/companies"')
            ->not->toContain('صنایع نمونه')
            ->and($this->get('/sitemap.xml')->getContent())->not->toContain('/companies');

        // The pages themselves still answer: the flag withholds the links,
        // not the content.
        $this->get("/companies/{$company->slug}")->assertOk();
    });

    it('advertises them once switched on', function (): void {
        config(['features.holding' => true]);
        $company = Company::factory()->create(['name' => ['fa' => 'صنایع نمونه']]);

        $html = $this->get('/')->assertOk()->getContent();
        $header = substr($html, strpos($html, '<header'), strpos($html, '</header>') - strpos($html, '<header'));
        $footer = substr($html, strpos($html, '<footer'));

        expect($header)->toContain('href="http://localhost/companies"')
            ->and($footer)->toContain('href="http://localhost/companies"')
            ->and($html)->toContain('صنایع نمونه')
            ->toContain('data-motion="horizontal"');

        expect($this->get('/sitemap.xml')->getContent())
            ->toContain('http://localhost/companies</loc>')
            ->toContain("http://localhost/companies/{$company->slug}");
    });

    it('takes effect in the sitemap on the next request, not after the cache expires', function (): void {
        Company::factory()->create();

        config(['features.holding' => false]);
        expect($this->get('/sitemap.xml')->getContent())->not->toContain('/companies');

        config(['features.holding' => true]);
        expect($this->get('/sitemap.xml')->getContent())->toContain('/companies');
    });
});
