import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

/**
 * Per-deal data key derived from the master key. A leaked ciphertext for one
 * deal is therefore useless against another, and rotating a single deal's key
 * is possible without touching the rest of the table.
 */
function dealKey(dealId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", env.credentialMasterKey(), Buffer.from(dealId, "utf8"), Buffer.from("escrowbridge/credential/v1"), 32),
  );
}

/**
 * Encrypts secret material for a deal. The returned envelope is what goes into
 * the database — plaintext is never persisted anywhere.
 *
 * Envelope layout: `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */
export function encryptSecret(dealId: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dealKey(dealId), iv);
  // Binding the deal id as additional data makes a ciphertext copied into
  // another deal's row fail to authenticate instead of silently decrypting.
  cipher.setAAD(Buffer.from(dealId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(dealId: string, envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed credential envelope");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Malformed credential envelope");
  }
  const decipher = createDecipheriv(ALGORITHM, dealKey(dealId), iv);
  decipher.setAAD(Buffer.from(dealId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Overwrites a credential envelope with an unrecoverable tombstone. */
export function purgedEnvelope(): string {
  return "v1.purged.purged.purged";
}

export function isPurged(envelope: string): boolean {
  return envelope === purgedEnvelope();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Short, unambiguous, human-readable code such as `EB-7QK2M9`. */
export function referenceCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `EB-${out}`;
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
