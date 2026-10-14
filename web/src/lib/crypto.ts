/**
 * Passwords and sessions on Node's built-in `crypto` — no auth package.
 *
 * scrypt for passwords, because it is memory-hard: the cost of guessing is
 * paid in RAM as well as CPU, which is what makes a GPU farm expensive. The
 * parameters are stored with each hash, so raising them later does not strand
 * existing accounts.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

const KEY_LENGTH = 64;
// N=2^15, r=8 → 32MB per hash. Comfortably inside a 2GB server, and slow
// enough to matter to an attacker.
const COST = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, params = COST): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, params, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** `scrypt$N$r$p$salt$hash`, all base64 — self-describing, so it can migrate. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);

  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');

  if (scheme !== 'scrypt' || !saltB64 || !hashB64) {
    return false;
  }

  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: COST.maxmem,
  });

  // Constant time: comparing with `===` leaks, through timing, how many
  // leading bytes of a guess were right.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A session token: 32 random bytes, URL-safe. Only its hash is persisted. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A readable one-time password for a freshly seeded account. */
export function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.';
  const bytes = randomBytes(length);

  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
