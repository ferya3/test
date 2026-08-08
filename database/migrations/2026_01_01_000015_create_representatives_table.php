<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('representatives', function (Blueprint $table): void {
            $table->id();

            $table->string('slug')->unique();
            $table->json('name');
            $table->json('company')->nullable();

            // Both indexed: the locator filters by province then city.
            $table->string('province', 64);
            $table->string('city', 64);

            $table->json('address')->nullable();
            $table->string('phone', 32);
            $table->string('mobile', 32)->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();

            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();

            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['province', 'city']);
            $table->index(['is_active', 'province']);
            $table->index(['is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('representatives');
    }
};
