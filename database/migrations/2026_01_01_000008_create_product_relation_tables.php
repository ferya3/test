<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Everything hanging off a product: multi-valued attributes, sheet sizes,
 * technical specifications, the gallery, and related-product links.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_thickness', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('thickness_id')->constrained('thicknesses')->cascadeOnDelete();

            $table->primary(['product_id', 'thickness_id']);
            $table->index('thickness_id');
        });

        Schema::create('application_product', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();

            $table->primary(['product_id', 'application_id']);
            $table->index('application_id');
        });

        Schema::create('product_dimensions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedInteger('width_mm');
            $table->unsignedInteger('height_mm');
            $table->string('label', 64)->nullable();
            $table->unsignedSmallInteger('position')->default(0);

            $table->unique(['product_id', 'width_mm', 'height_mm']);
        });

        Schema::create('product_specifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('group', 64)->nullable()->comment('spec sheet section');
            $table->json('label');
            $table->json('value');
            $table->string('unit', 24)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'position']);
        });

        Schema::create('product_media', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('media_id')->constrained('media')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);

            $table->unique(['product_id', 'media_id']);
            $table->index(['product_id', 'position']);
        });

        Schema::create('product_related', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('related_product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);

            $table->primary(['product_id', 'related_product_id']);
            $table->index('related_product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_related');
        Schema::dropIfExists('product_media');
        Schema::dropIfExists('product_specifications');
        Schema::dropIfExists('product_dimensions');
        Schema::dropIfExists('application_product');
        Schema::dropIfExists('product_thickness');
    }
};
