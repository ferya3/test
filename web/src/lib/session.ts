/**
 * Administrator sessions: a random token in an httpOnly cookie, and only its
 * SHA-256 in the database.
 *
 * Server-only. Every admin page calls `requireAdmin()` from a Node-runtime
 * layout — middleware runs on the Edge runtime, which has no `node:sqlite`, so
 * it cannot be the place sessions are checked.
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db.ts';
import { hashToken, newToken } from './crypto.ts';

export type Stage = 'mfa' | 'full';

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  totp_enabled: number;
  totp_secret: string | null;
  totp_last_step: number;
};

const COOKIE = 'ag_session';
const FULL_TTL = 12 * 60 * 60 * 1000;
// Long enough to unlock a phone and read a code, no longer.
const MFA_TTL = 5 * 60 * 1000;

/**
 * Cookies are Secure whenever the site is served over HTTPS. A Secure cookie
 * on a plain-HTTP site is silently dropped by the browser and nobody can log
 * in, which is what happened on the first server, so the flag follows the
 * configured URL instead of being hard-coded.
 */
function secure(): boolean {
  return (process.env.SITE_URL ?? '').startsWith('https://');
}

export async function startSession(userId: number, stage: Stage): Promise<void> {
  const token = newToken();
  const now = Date.now();
  const ttl = stage === 'full' ? FULL_TTL : MFA_TTL;

  // Expired rows are swept on login rather than by a cron job.
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at, stage) VALUES (?, ?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    now + ttl,
    now,
    stage,
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(ttl / 1000),
  });
}

async function currentToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

/** The signed-in user and how far through login they are, or null. */
export async function getSession(): Promise<{ user: AdminUser; stage: Stage } | null> {
  const token = await currentToken();

  if (!token || token.length > 128) return null;

  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.totp_enabled, u.totp_secret, u.totp_last_step, s.stage
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as (AdminUser & { stage: Stage }) | undefined;

  if (!row) return null;

  const { stage, ...user } = row;

  return { user, stage };
}

/** Use at the top of every admin page and action: a full session or the login page. */
export async function requireAdmin(): Promise<AdminUser> {
  const session = await getSession();

  if (!session) redirect('/admin/login');
  if (session.stage !== 'full') redirect('/admin/login/verify');

  return session.user;
}

export async function endSession(): Promise<void> {
  const token = await currentToken();

  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  (await cookies()).delete(COOKIE);
}

/** Sign out every session a user has — used after a password or 2FA change. */
export function endAllSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/* --------------------------------------------------------------------------
   Rate limiting
   -------------------------------------------------------------------------- */

/**
 * The client address, as nginx reports it.
 *
 * X-Real-IP is set by our own nginx config and overwrites whatever the client
 * sent. X-Forwarded-For is *appended to*, so its first entry is whatever the
 * client chose to claim and must not be trusted for rate limiting.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();

  return h.get('x-real-ip')?.trim() || 'local';
}

/**
 * True when `key` has had `max` or more attempts inside the window.
 * Records nothing — call `recordAttempt` for a failure.
 */
export function isLimited(key: string, max: number, windowMs: number): boolean {
  const since = Date.now() - windowMs;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at > ?').get(key, since) as {
    n: number;
  };

  return n >= max;
}

export function recordAttempt(...keys: string[]): void {
  const now = Date.now();
  const insert = db.prepare('INSERT INTO login_attempts (key, at) VALUES (?, ?)');

  for (const key of keys) insert.run(key, now);

  // Keep the table to a day's worth.
  db.prepare('DELETE FROM login_attempts WHERE at < ?').run(now - 24 * 60 * 60 * 1000);
}

export function clearAttempts(...keys: string[]): void {
  const remove = db.prepare('DELETE FROM login_attempts WHERE key = ?');

  for (const key of keys) remove.run(key);
}
