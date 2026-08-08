<?php

declare(strict_types=1);

use App\Services\Seo\SitemapBuilder;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Schedule
|--------------------------------------------------------------------------
|
| Run by panels-scheduler.timer, which deploy/install-ubuntu.sh installs.
|
| Deliberately short. Cache invalidation is driven by model observers rather
| than by a clock, and the sitemap rebuilds itself on demand, so there is no
| housekeeping here that exists only to paper over a missing trigger.
|
*/

/*
 * failed_jobs is the one table nothing else prunes. Media conversions retry
 * three times and then land here for good, so on a busy catalogue it is the
 * table that grows quietly for a year and then surprises somebody.
 */
Schedule::command('queue:prune-failed --hours=336')
    ->weekly()
    ->onOneServer()
    ->description('Drop failed jobs older than two weeks');

/*
 * Rebuild the sitemap off-request.
 *
 * It is cached for 24 hours and invalidated whenever a product, category,
 * article, project or page changes — so after any content edit the next
 * request pays to walk the whole catalogue. That was measured at 531ms on 600
 * products, and the visitor who happens to arrive first should not be the one
 * paying it. Nightly, plus whatever on-demand rebuilds the day's edits force.
 */
Schedule::call(fn () => app(SitemapBuilder::class)->render())
    ->name('sitemap:warm')
    ->dailyAt('03:10')
    ->onOneServer()
    ->description('Warm the sitemap cache');
