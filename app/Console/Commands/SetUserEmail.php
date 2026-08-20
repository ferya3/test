<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

/**
 * Changes an existing account's email address.
 *
 * The panel can do this too, and normally should. This exists for the one case
 * the panel cannot cover: the seeded accounts are created at @example.com, and
 * signing in to correct that requires an account you can already sign in to.
 *
 * Separate from user:password rather than an option on it. They are different
 * operations with different consequences — one changes who the account is, the
 * other changes what proves it — and a single command doing both invites doing
 * the wrong one by habit.
 */
class SetUserEmail extends Command
{
    protected $signature = 'user:email
        {current : The account\'s current email address}
        {new : The address to change it to}';

    protected $description = "Change an existing account's email address";

    public function handle(): int
    {
        $current = (string) $this->argument('current');
        $new = (string) $this->argument('new');

        $user = User::query()->where('email', $current)->first();

        if ($user === null) {
            $this->error("No user with the email {$current}.");
            $this->line('');
            $this->line('Accounts on this installation:');

            User::query()->orderBy('id')->get(['email'])
                ->each(fn (User $existing) => $this->line("  {$existing->email}"));

            return self::FAILURE;
        }

        $validator = Validator::make(
            ['email' => $new],
            ['email' => ['required', 'email:rfc', 'max:190', 'unique:users,email']],
        );

        if ($validator->fails()) {
            $this->error('That address cannot be used:');

            foreach ($validator->errors()->get('email') as $message) {
                $this->line("  {$message}");
            }

            return self::FAILURE;
        }

        $user->email = $new;
        $user->save();

        $this->info("{$current} is now {$new}.");

        // The password is unchanged and still belongs to this account. Saying
        // so avoids the reasonable assumption that renaming reset it.
        $this->line('The password is unchanged. To set one:');
        $this->line("  php artisan user:password {$new}");

        return self::SUCCESS;
    }
}
