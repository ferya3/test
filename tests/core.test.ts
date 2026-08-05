import assert from "node:assert/strict";
import { test } from "node:test";

import { formatUsdt, parseUsdt, feeFor } from "../src/lib/money";
import { encryptSecret, decryptSecret, referenceCode } from "../src/lib/crypto";
import {
  tronAddressFromPublicKey,
  evmAddressFromPublicKey,
  isValidTronAddress,
  isValidEvmAddress,
} from "../src/lib/wallet";
import { isEvmNetwork, networkShort } from "../src/lib/networks";
import { adjustBalanceSchema } from "../src/lib/validation";

test("parseUsdt converts decimal strings to micro-USDT", () => {
  assert.equal(parseUsdt("1"), 1_000_000n);
  assert.equal(parseUsdt("0.000001"), 1n);
  assert.equal(parseUsdt("1234.56"), 1_234_560_000n);
  assert.equal(parseUsdt("1,000"), 1_000_000_000n);
});

test("parseUsdt rejects anything that is not a clean amount", () => {
  for (const bad of ["", "-1", "1.2345678", "abc", "1e6", " 1 2 "]) {
    assert.throws(() => parseUsdt(bad), `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("formatUsdt is the inverse of parseUsdt", () => {
  for (const value of ["0.5", "1", "999.999999", "50000", "1234.56"]) {
    assert.equal(formatUsdt(parseUsdt(value)), value.replace(/^(\d+)/, (m) => Number(m).toLocaleString("en-US")));
  }
});

test("feeFor rounds down so the platform never over-charges", () => {
  assert.equal(feeFor(parseUsdt("100"), 300), parseUsdt("3"));
  assert.equal(feeFor(1n, 300), 0n);
  assert.equal(feeFor(parseUsdt("33.333333"), 250), 833_333n);
});

test("credentials round-trip through encryption", () => {
  const dealId = "deal_abc123";
  const secret = "s0me-p@ssword — with unicode ✓";
  const envelope = encryptSecret(dealId, secret);

  assert.ok(!envelope.includes(secret), "ciphertext must not contain the plaintext");
  assert.equal(decryptSecret(dealId, envelope), secret);
});

test("a ciphertext cannot be moved to another deal", () => {
  const envelope = encryptSecret("deal_one", "top secret");
  assert.throws(() => decryptSecret("deal_two", envelope));
});

test("tampering with the ciphertext is detected", () => {
  const envelope = encryptSecret("deal_x", "top secret");
  const parts = envelope.split(".");
  const body = Buffer.from(parts[3], "base64url");
  body[0] ^= 0xff;
  parts[3] = body.toString("base64url");
  assert.throws(() => decryptSecret("deal_x", parts.join(".")));
});

test("encryption is randomised per call", () => {
  const a = encryptSecret("deal_y", "same value");
  const b = encryptSecret("deal_y", "same value");
  assert.notEqual(a, b);
});

test("reference codes are unique and readable", () => {
  const codes = new Set(Array.from({ length: 500 }, () => referenceCode()));
  assert.equal(codes.size, 500);
  for (const code of codes) assert.match(code, /^EB-[2-9A-HJ-NP-Z]{6}$/);
});

test("tron addresses derive and validate", () => {
  // Well-known secp256k1 generator point; the resulting address is stable.
  const publicKey = Buffer.from(
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
      "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
    "hex",
  );
  const address = tronAddressFromPublicKey(publicKey);
  assert.match(address, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  assert.ok(isValidTronAddress(address));
});

test("the same key yields both an EVM and a TRON address", () => {
  const publicKey = Buffer.from(
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
      "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
    "hex",
  );
  const evm = evmAddressFromPublicKey(publicKey);
  assert.ok(isValidEvmAddress(evm), `${evm} should be a valid EVM address`);
  assert.ok(!isValidTronAddress(evm));
  assert.notEqual(evm, tronAddressFromPublicKey(publicKey));
});

test("BEP-20 is treated as an EVM chain, TRON is not", () => {
  assert.ok(isEvmNetwork("BSC"));
  assert.ok(isEvmNetwork("ETHEREUM"));
  assert.ok(!isEvmNetwork("TRON"));
  assert.equal(networkShort("BSC"), "BEP-20");
  assert.equal(networkShort("TRON"), "TRC-20");
});

test("address validation rejects the wrong chain and bad checksums", () => {
  assert.ok(!isValidTronAddress("0x0000000000000000000000000000000000000000"));
  assert.ok(!isValidTronAddress("TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
  assert.ok(isValidEvmAddress("0x0000000000000000000000000000000000000000"));
  assert.ok(!isValidEvmAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"));
});

test("a balance amount can be entered the way the page displays it", () => {
  // formatUsdt groups thousands, so this is exactly what an operator copies
  // out of the balance shown beside the field.
  assert.equal(formatUsdt(9_450_000_000n), "9,450");
  assert.equal(adjustBalanceSchema.safeParse({
    userId: "u1",
    direction: "DEBIT",
    amount: "9,450",
    reason: "Credited the wrong account",
  }).success, true);
});

test("zeroing a balance needs no amount, every other direction does", () => {
  const base = { userId: "u1", reason: "Credited the wrong account" };
  assert.equal(adjustBalanceSchema.safeParse({ ...base, direction: "ZERO" }).success, true);
  assert.equal(adjustBalanceSchema.safeParse({ ...base, direction: "DEBIT" }).success, false);
});
