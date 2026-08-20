<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Puts the decor family on the product itself.
 *
 * It was reachable only through the product's decor — products.decor_id ->
 * decors.decor_family — so putting a panel under "طرح چوب" meant first creating
 * a decor record and knowing which family it belonged to. That indirection
 * exists for a catalogue that sells named decors; this one sells two panels in
 * four looks, and the look is a property of the panel.
 *
 * The column is the filter's source of truth from here on. `decor_id` stays for
 * the product detail page, which names the specific decor where one is set.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->string('decor_family', 32)->nullable()->index()->after('decor_id');
        });

        /*
         * Backfill from the relation, so every product already in the catalogue
         * keeps the family it was being filtered by before this ran.
         *
         * A correlated subquery rather than an UPDATE ... JOIN: the join form
         * is MySQL-specific syntax that SQLite rejects outright, and the test
         * suite runs on SQLite. This form is standard and runs on both.
         */
        DB::table('products')
            ->whereNotNull('decor_id')
            ->update([
                'decor_family' => DB::raw(
                    '(select decor_family from decors where decors.id = products.decor_id)'
                ),
            ]);
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropIndex(['decor_family']);
            $table->dropColumn('decor_family');
        });
    }
};
