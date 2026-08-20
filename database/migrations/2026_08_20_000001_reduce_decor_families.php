<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Shortens the decor families to the four the catalogue filters by.
 *
 * `fabric` and `fantasy` are distinctions the trade does not draw at this
 * level — a linen texture is a finish, and terrazzo is a stone pattern — and a
 * row left holding a value the enum no longer has would throw the moment
 * anything read it back, on a page rather than here.
 */
return new class extends Migration
{
    /**
     * Old value => the family it becomes.
     */
    private const array MOVES = [
        'fabric' => 'finish',
        'fantasy' => 'stone',
    ];

    public function up(): void
    {
        foreach (self::MOVES as $from => $to) {
            DB::table('decors')->where('decor_family', $from)->update(['decor_family' => $to]);
        }
    }

    /**
     * Deliberately not reversed.
     *
     * The mapping is many-to-one: every `fabric` became `finish`, but so could
     * a decor that was always `finish`. Reversing would have to guess which,
     * and guessing wrong writes the wrong family onto real rows. Rolling back
     * leaves the data as it is, which the four-case enum reads correctly.
     */
    public function down(): void {}
};
