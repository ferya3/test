<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certificates', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->json('title');
            $table->json('issuer')->nullable();
            $table->json('description')->nullable();

            $table->string('certificate_number', 128)->nullable();
            $table->date('issued_at')->nullable();
            $table->date('expires_at')->nullable();

            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete()
                ->comment('certificate image');
            $table->foreignId('document_media_id')->nullable()->constrained('media')->nullOnDelete()
                ->comment('PDF scan');

            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['is_active', 'position']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('certificates');
    }
};
