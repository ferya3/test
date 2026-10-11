<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The holding's subsidiaries.
 *
 * One row per factory. Each gets its own page under /companies/{slug} and its
 * own accent colour, while the site stays one site: one design system, one
 * admin, one sitemap. Five sites inside one codebase would drift apart within
 * a year; five rows in one table cannot.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->json('name');
            $table->json('tagline')->nullable();
            $table->json('sector')->nullable()->comment('what the factory makes, in a few words');
            $table->json('summary')->nullable();
            $table->json('body')->nullable();
            $table->json('location')->nullable();

            // Figures the company page animates and the holding page totals.
            // Kept as plain columns rather than a JSON blob so they can be
            // summed across the group without parsing anything.
            $table->unsignedSmallInteger('founded_year')->nullable();
            $table->unsignedInteger('employees')->nullable();
            $table->unsignedInteger('site_area_sqm')->nullable();
            // Capacity is free text because its unit belongs to the industry:
            // sheets, tonnes and square metres a year do not add up.
            $table->json('capacity')->nullable();

            $table->char('accent_hex', 7)->nullable()
                ->comment('decorative only: rules, markers, borders — never text');

            $table->foreignId('logo_media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->foreignId('cover_media_id')->nullable()->constrained('media')->nullOnDelete();

            $table->string('website_url')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 32)->nullable();

            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
