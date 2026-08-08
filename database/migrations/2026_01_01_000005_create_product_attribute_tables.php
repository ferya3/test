<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The single-valued and multi-valued attributes a panel is filtered by.
 *
 * They share the same shape — slug, translatable name, ordering, active flag —
 * so they live in one migration rather than six near-identical files.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('colors', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->json('name');
            $table->char('hex', 7)->nullable()->comment('#RRGGBB');
            $table->string('color_family', 32)->nullable()->index()
                ->comment('neutral | wood | solid | metallic | stone');
            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete()
                ->comment('swatch image');
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('decors', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->json('name');
            $table->string('code', 64)->nullable()->index()->comment('manufacturer decor code');
            $table->json('description')->nullable();
            $table->string('decor_family', 32)->nullable()->index()
                ->comment('wood | stone | fabric | solid | fantasy');
            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('materials', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->json('name');
            $table->json('description')->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('surfaces', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->json('name');
            $table->json('description')->nullable();
            $table->unsignedTinyInteger('gloss_level')->nullable()->comment('0-100 gloss units');
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('applications', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->json('name');
            $table->json('description')->nullable();
            $table->string('icon', 48)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('thicknesses', function (Blueprint $table): void {
            $table->id();
            $table->decimal('value_mm', 5, 2)->unique();
            $table->string('label', 32)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'value_mm']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('thicknesses');
        Schema::dropIfExists('applications');
        Schema::dropIfExists('surfaces');
        Schema::dropIfExists('materials');
        Schema::dropIfExists('decors');
        Schema::dropIfExists('colors');
    }
};
