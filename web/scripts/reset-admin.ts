/**
 * Show the administrator account(s) and give one a new password.
 *
 *   sudo bash /opt/artavil-web/web/deploy/reset-admin.sh
 *
 * Passwords are stored only as scrypt hashes, so a forgotten one cannot be
 * read back — only replaced. The new password is printed once. Every session
 * of that account is signed out and failed-login counters are cleared, so a
 * lockout from earlier attempts does not block the new password.
 *
 * Two-step login is left as it is unless RESET_2FA=1, for when the phone with
 * the authenticator app is the thing that was lost.
 */
import { db } from '../src/lib/db.ts';
import { generatePassword, hashPassword } from '../src/lib/crypto.ts';

const users = db.prepare('SELECT id, email, totp_enabled FROM users ORDER BY id').all() as {
  id: number;
  email: string;
  totp_enabled: number;
}[];

if (users.length === 0) {
  console.log('No administrator exists. Run: npm run db:seed');
  process.exit(1);
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const user = email ? users.find((u) => u.email.toLowerCase() === email) : users[0];

if (!user) {
  console.log(`No administrator with the email ${email}. Accounts: ${users.map((u) => u.email).join(', ')}`);
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD || generatePassword();
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
db.prepare('DELETE FROM login_attempts').run();

let twoFactor = user.totp_enabled ? 'on (unchanged)' : 'off';
if (process.env.RESET_2FA === '1') {
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
  twoFactor = 'turned off — turn it on again under «امنیت»';
}

console.log('');
console.log('  Admin panel:  <your site address>/admin');
console.log(`  Email:        ${user.email}`);
console.log(`  Password:     ${process.env.ADMIN_PASSWORD ? '(the one you chose)' : password}`);
console.log(`  2-step login: ${twoFactor}`);
console.log('');
console.log('  Store the password now; it is not shown again.');
