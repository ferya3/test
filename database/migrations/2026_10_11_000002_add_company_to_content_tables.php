<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Says which subsidiary a piece of content belongs to.
 *
 * Nullable everywhere, and that is the meaning rather than a gap: a row with no
 * company belongs to the holding itself — group news, a certificate the whole
 * group holds, a catalogue covering every factory. Every row that exists when
 * this runs keeps working exactly as before until an editor assigns it.
 *
 * Deleting a company hands its content back to the holding rather than
 * deleting it, for the same reason: a product page that disappears because
 * somebody tidied the company list is a broken link nobody chose.
 */
return new class extends Migration
{
    /**
     * @var list<string>
     */
    private const array TABLES = ['products', 'projects', 'certificates', 'catalogs', 'articles'];

    public function up(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->foreignId('company_id')->nullable()->after('id')
                    ->constrained('companies')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->dropConstrainedForeignId('company_id');
            });
        }
    }
};
