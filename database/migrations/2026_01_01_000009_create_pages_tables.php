<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The editorial pages (About Factory, Factory & Production, Production Process,
 * Quality Control) are CMS-driven. page_sections is an ordered, typed block list
 * shared by every template, so process steps and QC stages are just section types.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('template', 48)->default('default')
                ->comment('default | about | factory | process | quality');

            $table->json('title');
            $table->json('subtitle')->nullable();
            $table->json('body')->nullable();

            $table->foreignId('hero_media_id')->nullable()->constrained('media')->nullOnDelete();

            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['is_active', 'slug']);
        });

        Schema::create('page_sections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('page_id')->constrained('pages')->cascadeOnDelete();

            $table->string('type', 48)->default('text')
                ->comment('text | step | stat | feature | quote | gallery | cta | timeline');

            $table->json('heading')->nullable();
            $table->json('subheading')->nullable();
            $table->json('body')->nullable();

            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete();

            // Type-specific payload (stat values, CTA targets, timeline years …).
            $table->json('data')->nullable();

            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['page_id', 'is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('page_sections');
        Schema::dropIfExists('pages');
    }
};
