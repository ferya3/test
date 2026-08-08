<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalogs', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->json('title');
            $table->json('description')->nullable();

            $table->foreignId('cover_media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->foreignId('file_media_id')->nullable()->constrained('media')->nullOnDelete()
                ->comment('the PDF itself');

            $table->string('version', 32)->nullable();
            $table->timestamp('published_at')->nullable();

            // When true the PDF is only released after the lead form is completed.
            $table->boolean('requires_registration')->default(true);
            $table->unsignedBigInteger('download_count')->default(0);

            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['is_active', 'position']);
        });

        Schema::create('catalog_requests', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('catalog_id')->nullable()->constrained('catalogs')->nullOnDelete();

            $table->string('name');
            $table->string('company')->nullable();
            $table->string('phone', 32);
            $table->string('email')->nullable();
            $table->string('city', 64)->nullable();
            $table->text('message')->nullable();

            $table->string('status', 16)->default('new')->comment('new | contacted | closed');

            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 512)->nullable();

            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('handled_at')->nullable();

            $table->timestamps();

            $table->index('phone');
            $table->index(['status', 'created_at']);
            $table->index(['catalog_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_requests');
        Schema::dropIfExists('catalogs');
    }
};
