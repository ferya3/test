/**
 * TOTP (RFC 6238) on Node's built-in crypto — the codes Google Authenticator,
 * Authy and every other authenticator app produce.
 *
 * SHA-1, 6 digits, 30-second steps: the defaults every app assumes when it is
 * given only a setup key, which is how enrolment works here.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];

  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** A new 160-bit secret, base32 — the length RFC 4226 recommends. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;

  return String(binary).padStart(DIGITS, '0');
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/**
 * The time step the code belongs to, or null.
 *
 * One step either side is accepted: a phone clock a few seconds off, or a code
 * typed as it rolled over, should not lock an administrator out. A server
 * clock that is minutes off will still fail every code — which is what
 * happened on the first server, so keep NTP running.
 *
 * `afterStep` is the last step already used; a code at or before it is a
 * replay and refused.
 */
export function verifyTotp(secret: string, code: string, afterStep = 0, now = Date.now()): number | null {
  const digits = code.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  if (digits.length !== DIGITS) return null;

  const step = currentStep(now);

  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate <= afterStep) continue;

    const expected = Buffer.from(codeAt(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(digits))) {
      return candidate;
    }
  }

  return null;
}

/** For tests: the code an authenticator would show at `now`. */
export function totpAt(secret: string, now = Date.now()): string {
  return codeAt(secret, currentStep(now));
}

/** The `otpauth://` URI authenticator apps import. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });

  return `otpauth://totp/${label}?${params}`;
}
