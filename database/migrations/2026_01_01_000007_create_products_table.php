<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->string('code', 64)->unique();

            $table->foreignId('category_id')->constrained('categories')->restrictOnDelete();

            // Single-valued attributes: one panel SKU is one decor in one colour
            // on one substrate with one finish.
            $table->foreignId('material_id')->nullable()->constrained('materials')->nullOnDelete();
            $table->foreignId('surface_id')->nullable()->constrained('surfaces')->nullOnDelete();
            $table->foreignId('decor_id')->nullable()->constrained('decors')->nullOnDelete();
            $table->foreignId('color_id')->nullable()->constrained('colors')->nullOnDelete();

            $table->json('name');
            $table->json('short_description')->nullable();
            $table->json('description')->nullable();

            $table->foreignId('main_media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->foreignId('datasheet_media_id')->nullable()->constrained('media')->nullOnDelete()
                ->comment('PDF technical datasheet');

            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamp('published_at')->nullable();

            // Denormalised searchable text (both locales). JSON columns are not
            // usefully indexable, so search reads this instead.
            $table->text('search_index')->nullable();

            $table->unsignedBigInteger('view_count')->default(0);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['is_active', 'published_at']);
            $table->index(['category_id', 'is_active']);
            $table->index(['is_featured', 'is_active']);
            $table->index(['is_active', 'position']);
        });

        // FULLTEXT is MySQL-only; SQLite (tests) falls back to LIKE at runtime.
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE products ADD FULLTEXT products_search_index_fulltext (search_index)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
