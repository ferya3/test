// Minimal Rubika API v6 client: data-center lookup, signed encrypted calls,
// endpoint failover and back-off on TOO_REQUESTS.
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});
  const DC_URL = 'https://getdcmess.iranlms.ir/';
  const CLIENT = {
    app_name: 'Main',
    app_version: '4.4.6',
    platform: 'Web',
    package: 'web.rubika.ir',
    lang_code: 'fa',
  };

  class RubikaError extends Error {
    constructor(statusDet, raw) {
      super(statusDet);
      this.statusDet = statusDet;
      this.raw = raw;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Requests go out from the page first, so they carry Rubika Web's own
  // origin. If the browser refuses (CORS / network), the extension's service
  // worker makes the same request using its host permission.
  async function httpJson(url, body) {
    const init = body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) throw err;
      const relayed = await chrome.runtime.sendMessage({ type: 'rxg-fetch', url, method: init.method, body });
      if (!relayed || !relayed.ok) throw new Error((relayed && relayed.error) || `HTTP ${relayed && relayed.status}`);
      return JSON.parse(relayed.text);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function getApiUrls() {
    const json = await httpJson(DC_URL);
    const data = (json && json.data) || {};
    const api = data.API || {};
    const codes = [data.default_api, ...(data.default_apis || []), ...Object.keys(api)]
      .filter((c) => c !== undefined && c !== null)
      .map(String);
    const urls = [...new Set(codes)].filter((c) => api[c]).map((c) => api[c].replace(/\/?$/, '/'));
    if (!urls.length) throw new Error('no API servers in data-center response');
    return urls;
  }

  class RubikaClient {
    constructor(session, apiUrls) {
      this.session = session;
      this.apiUrls = apiUrls;
      this.current = 0;
    }

    async call(method, input = {}, { retries = 3 } = {}) {
      const { crypto } = RXG;
      const dataEnc = await crypto.encrypt(this.session, { method, input, client: CLIENT });
      const body = JSON.stringify({
        api_version: '6',
        auth: this.session.headerAuth,
        data_enc: dataEnc,
        sign: await crypto.sign(this.session, dataEnc),
      });

      for (let attempt = 0; ; attempt++) {
        const response = await this.post(body);
        let result = response;
        if (response && response.data_enc) {
          try {
            result = await crypto.decrypt(this.session, response.data_enc);
          } catch {
            throw new RubikaError('DECRYPT_FAILED', response);
          }
        }
        if (result && result.status === 'OK' && result.status_det === 'OK') return result.data;

        const det = (result && (result.status_det || result.status)) || 'UNKNOWN';
        if (det === 'TOO_REQUESTS' && attempt < retries) {
          await sleep(10000 * (attempt + 1));
          continue;
        }
        throw new RubikaError(det, result);
      }
    }

    async post(body) {
      let lastError;
      for (let i = 0; i < this.apiUrls.length; i++) {
        const index = (this.current + i) % this.apiUrls.length;
        try {
          const json = await httpJson(this.apiUrls[index], body);
          this.current = index;
          return json;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    }
  }

  RXG.RubikaError = RubikaError;
  RXG.RubikaClient = RubikaClient;
  RXG.getApiUrls = getApiUrls;
  RXG.sleep = sleep;
})();
