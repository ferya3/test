// Builds a signing session from the account's own `auth` (32 chars) and RSA
// private key. These are the same two values every Rubika library asks the
// account owner for (rubpy/pyrubi/arsein `auth` + `private_key`).
//
// The panel lets the owner paste them. As a convenience it can also prefill
// from the one place Rubika Web keeps them — localStorage under keys that
// start with "auth" / "privateKey" — but nothing is scraped beyond those and
// nothing leaves the page; the values are only used to sign the owner's own
// requests to Rubika.
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});

  function readFromLocalStorage() {
    const out = { auth: '', privateKey: '' };
    let store;
    try {
      store = globalThis.localStorage;
    } catch {
      return out;
    }
    if (!store) return out;

    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      const lower = key.toLowerCase();
      const value = (store.getItem(key) || '').trim().replace(/^"([\s\S]*)"$/, '$1');
      if (!out.auth && lower.startsWith('auth') && /^[a-z0-9]{32}$/.test(value)) out.auth = value;
      if (!out.privateKey && (lower.includes('privatekey') || lower.includes('private_key'))) {
        out.privateKey = value;
      }
    }
    return out;
  }

  // Confirms the auth+key actually sign valid requests for a real account.
  async function build({ auth, privateKey }) {
    const cleanAuth = String(auth || '').trim();
    if (!/^[a-z0-9]{32}$/.test(cleanAuth)) {
      throw new Error('auth باید ۳۲ کاراکتر (a-z و 0-9) باشد');
    }
    if (!String(privateKey || '').trim()) {
      throw new Error('کلید خصوصی (private key) لازم است');
    }

    // rubpy stores the auth the AES key is derived from; Rubika Web stores the
    // swapped form it sends on the wire. Try both.
    const apiUrls = await RXG.getApiUrls();
    let lastError;
    for (const keyAuth of [cleanAuth, RXG.crypto.swapAuth(cleanAuth)]) {
      const session = await RXG.crypto.createSession(keyAuth, privateKey);
      const client = new RXG.RubikaClient(session, apiUrls);
      try {
        const me = await client.call('getUserInfo', {}, { retries: 0 });
        return { client, me: me.user || me };
      } catch (err) {
        if (!(err instanceof RXG.RubikaError)) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  RXG.session = { readFromLocalStorage, build };
})();
