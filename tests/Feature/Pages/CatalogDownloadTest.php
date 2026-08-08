<?php

declare(strict_types=1);

use App\Models\Catalog;
use App\Models\CatalogRequest;
use App\Models\Media;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    Storage::fake('media');
});

function catalogWithFile(array $overrides = []): Catalog
{
    $media = Media::factory()->pdf()->create(['disk' => 'media']);
    Storage::disk('media')->put($media->path, 'PDF-CONTENT');

    return Catalog::factory()->create(['file_media_id' => $media->id, ...$overrides]);
}

function validCatalogRequest(array $overrides = []): array
{
    return [
        'name' => 'مریم احمدی',
        'phone' => '09121234567',
        ...$overrides,
    ];
}

it('lists active catalogues', function (): void {
    $catalog = catalogWithFile();

    $this->get('/catalog')->assertOk()->assertSee($catalog->title);
});

describe('an open catalogue', function (): void {
    it('downloads without a form', function (): void {
        $catalog = catalogWithFile(['requires_registration' => false]);

        $this->get("/catalog/{$catalog->slug}/download")->assertOk();
    });

    it('counts the download', function (): void {
        $catalog = catalogWithFile(['requires_registration' => false]);

        $this->get("/catalog/{$catalog->slug}/download")->assertOk();

        expect($catalog->fresh()->download_count)->toBe(1);
    });
});

describe('a gated catalogue', function (): void {
    it('refuses a direct download before the form is completed', function (): void {
        // Otherwise the download URL is simply a way around the lead form.
        $catalog = catalogWithFile(['requires_registration' => true]);

        $this->get("/catalog/{$catalog->slug}/download")->assertNotFound();
    });

    it('records the lead and releases the file', function (): void {
        $catalog = catalogWithFile(['requires_registration' => true]);

        $this->post("/catalog/{$catalog->slug}/request", validCatalogRequest())
            ->assertRedirect(lroute('catalog.download', ['catalog' => $catalog->slug]));

        expect(CatalogRequest::query()->sole()->catalog_id)->toBe($catalog->id);

        $this->get("/catalog/{$catalog->slug}/download")->assertOk();
    });

    it('grants access to that catalogue only', function (): void {
        $granted = catalogWithFile(['requires_registration' => true]);
        $other = catalogWithFile(['requires_registration' => true]);

        $this->post("/catalog/{$granted->slug}/request", validCatalogRequest());

        $this->get("/catalog/{$granted->slug}/download")->assertOk();
        $this->get("/catalog/{$other->slug}/download")->assertNotFound();
    });

    it('validates the lead form', function (): void {
        $catalog = catalogWithFile(['requires_registration' => true]);

        $this->post("/catalog/{$catalog->slug}/request", ['name' => 'x'])
            ->assertSessionHasErrors(['name', 'phone']);

        expect(CatalogRequest::count())->toBe(0);
    });

    it('rejects a submission that fills the honeypot', function (): void {
        $catalog = catalogWithFile(['requires_registration' => true]);

        $this->post("/catalog/{$catalog->slug}/request", validCatalogRequest([
            'website' => 'http://spam.example',
        ]))->assertSessionHasErrors('website');

        expect(CatalogRequest::count())->toBe(0);
    });
});

describe('unavailable catalogues', function (): void {
    it('hides an inactive catalogue', function (): void {
        $catalog = catalogWithFile(['is_active' => false, 'requires_registration' => false]);

        $this->get("/catalog/{$catalog->slug}/download")->assertNotFound();
    });

    it('hides a catalogue with no file attached', function (): void {
        $catalog = Catalog::factory()->withoutFile()->create(['requires_registration' => false]);

        $this->get("/catalog/{$catalog->slug}/download")->assertNotFound();
    });

    it('refuses to record a lead against an unavailable catalogue', function (): void {
        $catalog = Catalog::factory()->withoutFile()->create();

        $this->post("/catalog/{$catalog->slug}/request", validCatalogRequest())
            ->assertNotFound();

        expect(CatalogRequest::count())->toBe(0);
    });
});
