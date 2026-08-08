<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seo_metadata', function (Blueprint $table): void {
            $table->id();

            $table->string('seoable_type');
            $table->unsignedBigInteger('seoable_id');

            // Translatable overrides; null means "derive from the model".
            $table->json('title')->nullable();
            $table->json('description')->nullable();
            $table->json('keywords')->nullable();

            $table->string('canonical_url', 2048)->nullable();

            $table->json('og_title')->nullable();
            $table->json('og_description')->nullable();
            $table->foreignId('og_media_id')->nullable()->constrained('media')->nullOnDelete();

            $table->string('twitter_card', 32)->default('summary_large_image');
            $table->string('robots', 64)->nullable()->comment('e.g. index,follow');

            // Hand-authored JSON-LD that replaces the generated graph.
            $table->json('structured_data')->nullable();

            $table->timestamps();

            $table->unique(['seoable_type', 'seoable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seo_metadata');
    }
};
