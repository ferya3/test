<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->json('title');
            $table->json('client')->nullable();
            $table->json('location')->nullable();
            $table->json('summary')->nullable();
            $table->json('body')->nullable();

            $table->foreignId('cover_media_id')->nullable()->constrained('media')->nullOnDelete();

            $table->unsignedSmallInteger('year')->nullable();
            $table->unsignedInteger('area_sqm')->nullable();
            $table->string('project_type', 64)->nullable()
                ->comment('residential | commercial | hospitality | office');
            $table->date('completed_at')->nullable();

            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['is_active', 'position']);
            $table->index(['is_featured', 'is_active']);
            $table->index(['year', 'is_active']);
        });

        Schema::create('project_media', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('media_id')->constrained('media')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);

            $table->unique(['project_id', 'media_id']);
            $table->index(['project_id', 'position']);
        });

        // Products used in a project — drives internal linking on both sides.
        Schema::create('product_project', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();

            $table->primary(['product_id', 'project_id']);
            $table->index('project_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_project');
        Schema::dropIfExists('project_media');
        Schema::dropIfExists('projects');
    }
};
