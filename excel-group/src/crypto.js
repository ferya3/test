// Rubika API v6 request encryption, ported from the rubpy / arsein clients.
//
// - The `auth` sent with each request and the auth the AES key is built from
//   are each other's image under swapAuth (an involution).
// - Payloads are AES-256-CBC with a zero IV, key = passphrase(auth).
// - Requests are signed with the account's RSA key (PKCS#1 v1.5, SHA-256).
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});
  const subtle = globalThis.crypto.subtle;
  const utf8 = new TextEncoder();
  const ZERO_IV = new Uint8Array(16);

  function swapAuth(auth) {
    let out = '';
    for (const ch of auth) {
      const c = ch.charCodeAt(0);
      if (c >= 97 && c <= 122) out += String.fromCharCode(((32 - (c - 97)) % 26 + 26) % 26 + 97);
      else if (c >= 65 && c <= 90) out += String.fromCharCode(((29 - (c - 65)) % 26 + 26) % 26 + 65);
      else if (c >= 48 && c <= 57) out += String.fromCharCode(((13 - (c - 48)) % 10 + 10) % 10 + 48);
      else out += ch;
    }
    return out;
  }

  function passphrase(auth) {
    if (auth.length !== 32) throw new Error('auth must be 32 characters');
    const n = auth.slice(16, 24) + auth.slice(0, 8) + auth.slice(24, 32) + auth.slice(8, 16);
    let out = '';
    for (const ch of n) {
      const c = ch.charCodeAt(0);
      if (c >= 48 && c <= 57) out += String.fromCharCode(((c - 48 + 5) % 10) + 48);
      else out += String.fromCharCode((((c - 97 + 9) % 26) + 26) % 26 + 97);
    }
    return out;
  }

  function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64ToBytes(text) {
    let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function concat(...parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  function derTlv(tag, body) {
    let len;
    if (body.length < 0x80) {
      len = [body.length];
    } else {
      len = [];
      for (let n = body.length; n > 0; n >>= 8) len.unshift(n & 0xff);
      len.unshift(0x80 | len.length);
    }
    return concat(Uint8Array.of(tag, ...len), body);
  }

  // Skips the outer SEQUENCE header and the version INTEGER, then looks at the
  // next tag: PKCS#8 continues with an AlgorithmIdentifier SEQUENCE, PKCS#1
  // with the modulus INTEGER.
  function isPkcs8(der) {
    let i = 1;
    i += der[i] & 0x80 ? 1 + (der[i] & 0x7f) : 1;
    i += 2 + der[i + 1];
    return der[i] === 0x30;
  }

  const RSA_ALGORITHM_ID = Uint8Array.of(
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  );

  function pkcs1ToPkcs8(pkcs1) {
    return derTlv(0x30, concat(Uint8Array.of(0x02, 0x01, 0x00), RSA_ALGORITHM_ID, derTlv(0x04, pkcs1)));
  }

  // Accepts every shape the key turns up in: PEM (PKCS#1 or PKCS#8), bare
  // base64 DER ("MII..."), or Rubika Web's base64 JSON wrapper ("eyJ...")
  // whose `d` field holds one of the former.
  function privateKeyToPkcs8(text) {
    let s = String(text).trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    if (s.startsWith('eyJ')) {
      const inner = JSON.parse(new TextDecoder().decode(b64ToBytes(s)));
      if (!inner || !inner.d) throw new Error('private key JSON has no "d" field');
      return privateKeyToPkcs8(inner.d);
    }
    s = s.replace(/-----(BEGIN|END)[^-]*-----/g, '');
    const der = b64ToBytes(s);
    if (der[0] !== 0x30) throw new Error('private key is not DER encoded');
    return isPkcs8(der) ? der : pkcs1ToPkcs8(der);
  }

  async function createSession(keyAuth, privateKeyText) {
    const aesKey = await subtle.importKey('raw', utf8.encode(passphrase(keyAuth)), 'AES-CBC', false, [
      'encrypt',
      'decrypt',
    ]);
    const signKey = privateKeyText
      ? await subtle.importKey(
          'pkcs8',
          privateKeyToPkcs8(privateKeyText),
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['sign'],
        )
      : null;
    return { headerAuth: swapAuth(keyAuth), aesKey, signKey };
  }

  async function encrypt(session, data) {
    const plain = typeof data === 'string' ? data : JSON.stringify(data);
    const cipher = await subtle.encrypt({ name: 'AES-CBC', iv: ZERO_IV }, session.aesKey, utf8.encode(plain));
    return bytesToB64(new Uint8Array(cipher));
  }

  async function decrypt(session, dataEnc) {
    const plain = await subtle.decrypt({ name: 'AES-CBC', iv: ZERO_IV }, session.aesKey, b64ToBytes(dataEnc));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function sign(session, dataEnc) {
    const sig = await subtle.sign('RSASSA-PKCS1-v1_5', session.signKey, utf8.encode(dataEnc));
    return bytesToB64(new Uint8Array(sig));
  }

  RXG.crypto = { swapAuth, passphrase, privateKeyToPkcs8, createSession, encrypt, decrypt, sign, b64ToBytes };
})();
