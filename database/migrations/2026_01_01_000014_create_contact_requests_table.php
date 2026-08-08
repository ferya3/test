<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One table for every inbound lead, discriminated by `type`:
 * contact (تماس با کارخانه), quote (استعلام قیمت), sample (درخواست نمونه)
 * and representation (درخواست نمایندگی).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_requests', function (Blueprint $table): void {
            $table->id();

            $table->string('type', 24)->default('contact')
                ->comment('contact | quote | sample | representation');

            $table->string('name');
            $table->string('company')->nullable();
            $table->string('phone', 32);
            $table->string('email')->nullable();
            $table->string('province', 64)->nullable();
            $table->string('city', 64)->nullable();
            $table->string('subject')->nullable();
            $table->text('message');

            // Set when the enquiry was raised from a product page.
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();

            $table->string('status', 16)->default('new')->comment('new | in_progress | closed');

            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 512)->nullable();

            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('handled_at')->nullable();

            $table->timestamps();

            $table->index('phone');
            $table->index(['type', 'status', 'created_at']);
            $table->index(['status', 'created_at']);
            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_requests');
    }
};
