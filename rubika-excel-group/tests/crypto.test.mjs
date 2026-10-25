// Checks the browser crypto against vectors produced by rubpy's Python
// implementation (tests/vectors.json; the RSA key there is a throwaway
// generated only for this test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../src/crypto.js');
const { crypto: rc } = globalThis.RXG;
const v = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

test('auth swap matches rubpy decode_auth and is its own inverse', () => {
  assert.equal(rc.swapAuth(v.auth), v.header);
  assert.equal(rc.swapAuth(v.authDigits), v.headerDigits);
  assert.equal(rc.swapAuth(rc.swapAuth(v.authDigits)), v.authDigits);
});

test('passphrase matches rubpy (letters) and arsein (digits)', () => {
  assert.equal(rc.passphrase(v.auth), v.passphrase);
  assert.equal(rc.passphrase(v.authDigits), v.passphraseDigits);
});

test('encrypt, decrypt and sign match the Python client byte for byte', async () => {
  const session = await rc.createSession(v.auth, v.pem);
  assert.equal(session.headerAuth, v.header);
  assert.equal(await rc.encrypt(session, v.payload), v.dataEnc);
  assert.deepEqual(await rc.decrypt(session, v.dataEnc), JSON.parse(v.payload));
  assert.equal(await rc.sign(session, v.dataEnc), v.sign);
});

test('every private key shape produces the same signature', async () => {
  for (const key of [v.pkcs8, v.web, JSON.stringify(v.pem), v.pem.replace(/-----[^-]+-----|\n/g, '')]) {
    const session = await rc.createSession(v.auth, key);
    assert.equal(await rc.sign(session, v.dataEnc), v.sign);
  }
});
