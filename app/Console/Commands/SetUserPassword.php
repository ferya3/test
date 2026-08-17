<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/**
 * Sets an existing user's password.
 *
 * This exists because the two obvious alternatives are both wrong.
 * `db:seed` will not do it — AdminUserSeeder deliberately never resets the
 * password of an account that already exists, and refuses to run at all while
 * configuration is cached, which it always is in production. And a `tinker
 * --execute` one-liner puts the new password into shell history, into the
 * process list where any user on the box can read it, and often into the
 * operator's terminal scrollback.
 *
 * So the password is prompted for, hidden, by default. `--generate` is there
 * for the case where a strong one is wanted and will be copied straight into a
 * password manager.
 */
class SetUserPassword extends Command
{
    protected $signature = 'user:password
        {email : The email address of the account to update}
        {--generate : Generate a strong password and print it once}';

    protected $description = "Set an existing user's password";

    public function handle(): int
    {
        $email = (string) $this->argument('email');

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->error("No user with the email {$email}.");

            // Guessing at what was meant is unhelpful; showing what exists is
            // not, and this is a short list on every install of this site.
            $this->line('');
            $this->line('Accounts on this installation:');

            User::query()->orderBy('id')->get(['email'])
                ->each(fn (User $existing) => $this->line("  {$existing->email}"));

            return self::FAILURE;
        }

        if ($this->option('generate')) {
            $password = Str::password(24);
        } else {
            $password = (string) $this->secret('New password');
            $confirmation = (string) $this->secret('Confirm new password');

            if ($password !== $confirmation) {
                $this->error('The two entries do not match. Nothing was changed.');

                return self::FAILURE;
            }
        }

        // The panel's rule, minus `uncompromised()`. That check calls the Have
        // I Been Pwned API, and this command has to work on a host with no
        // outbound access — failing a password rotation because a breach
        // database is unreachable would be worse than not consulting it.
        $validator = Validator::make(
            ['password' => $password],
            ['password' => ['required', Password::min(12)->letters()->numbers()->symbols()]],
        );

        if ($validator->fails()) {
            $this->error('That password is too weak:');

            foreach ($validator->errors()->get('password') as $message) {
                $this->line("  {$message}");
            }

            return self::FAILURE;
        }

        // Assigned in the clear: User casts `password` as `hashed`, so hashing
        // here as well would rely on that cast recognising an already-hashed
        // value. It does, but the panel assigns plainly too and one convention
        // is better than two.
        $user->password = $password;
        $user->save();

        $this->info("Password updated for {$user->email}.");

        if ($this->option('generate')) {
            $this->warn("New password: {$password}");
            $this->warn('Shown once — store it now.');
        }

        // Changing a password does not clear an enrolled TOTP secret, and
        // someone rotating a password because they think an account is
        // compromised will usually want to know that.
        if ($user->two_factor_secret !== null) {
            $this->line('');
            $this->line('Two-factor authentication is still enrolled on this account.');
        }

        return self::SUCCESS;
    }
}
