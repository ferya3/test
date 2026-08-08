<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media', function (Blueprint $table): void {
            $table->id();

            $table->string('disk', 32)->default('media');
            $table->string('path')->unique();
            $table->string('filename');
            $table->string('mime_type', 128);
            $table->string('extension', 16);
            $table->unsignedBigInteger('size')->comment('bytes');

            // Stored so every <img> can be rendered with explicit dimensions,
            // which is what keeps CLS inside budget.
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();

            // Translatable {"fa": "...", "en": "..."}
            $table->json('alt')->nullable();
            $table->json('title')->nullable();
            $table->json('caption')->nullable();

            $table->string('collection', 48)->default('general')->index();

            // Map of generated derivatives, e.g.
            // {"webp": {"640": "…/img-640.webp"}, "avif": {"640": "…/img-640.avif"}}
            $table->json('conversions')->nullable();

            // sha256 of the original file, used to de-duplicate re-uploads.
            $table->string('checksum', 64)->nullable()->index();

            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['collection', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};
