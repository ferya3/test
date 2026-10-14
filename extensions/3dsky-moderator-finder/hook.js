/*
 * Runs inside the page's own JS world (document_start) so it can observe the
 * site's fetch / XHR / WebSocket / EventSource traffic and its app state.
 * Everything captured is handed to the content script through window.postMessage.
 * Request headers (cookies, tokens) are never captured.
 */
(() => {
  if (window.__3dskyModFinderHooked) return;
  Object.defineProperty(window, '__3dskyModFinderHooked', { value: true });

  const CH = '__3dsky_modfinder__';
  const MAX_BODY = 2000000;
  // Cheap pre-filter: bodies are only forwarded when they mention something moderator-like
  // (or when the user turned on "capture everything" in the panel).
  const WATCH = /moder|review|curat|inspect|assign|approv|verif|examin|expert|supervis|модер|куратор|проверя|проверк|ревью/i;
  const STATE_KEYS = ['__NUXT__', '__NEXT_DATA__', '__INITIAL_STATE__', '__APOLLO_STATE__', '__PRELOADED_STATE__', '__APP_STATE__'];

  let captureAll = false;
  let seq = 0;

  const post = (entry) => {
    try { window.postMessage({ ch: CH, entry }, '*'); } catch (_) { /* ignore */ }
  };
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch (_) { return String(u); }
  };
  const textual = (ct) => !ct || /json|text|javascript|xml|graphql|x-www-form/i.test(ct);

  const describeBody = (b) => {
    try {
      if (b == null) return null;
      if (typeof b === 'string') return b.slice(0, 200000);
      if (b instanceof URLSearchParams) return b.toString();
      if (b instanceof FormData) {
        const o = {};
        for (const [k, v] of b.entries()) {
          const val = typeof v === 'string' ? v : `[File ${v.name} ${v.size}B]`;
          if (k in o) o[k] = [].concat(o[k], val);
          else o[k] = val;
        }
        return JSON.stringify(o);
      }
      if (b instanceof Blob) return `[binary ${b.size}B]`;
      if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return `[binary ${b.byteLength}B]`;
    } catch (_) { /* ignore */ }
    return null;
  };

  const pickHeaders = (h) => {
    const o = {};
    try {
      h.forEach((v, k) => { if (WATCH.test(k) || WATCH.test(v)) o[k] = v; });
    } catch (_) { /* ignore */ }
    return o;
  };

  const emitBody = (base, text) => {
    const keep = captureAll || WATCH.test(text);
    post({ ...base, size: text.length, resBody: keep ? text.slice(0, MAX_BODY) : null });
  };

  // ---------- fetch ----------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const id = ++seq;
      const t = Date.now();
      let url = '';
      let method = 'GET';
      try {
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (_) { /* ignore */ }
      const reqBody = describeBody(init && init.body);
      const p = origFetch.apply(this, arguments);
      p.then((res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          const len = Number(res.headers.get('content-length')) || 0;
          const base = {
            id, t, kind: 'fetch', method, url: abs(url), status: res.status, ctype: ct, reqBody, resHeaders: pickHeaders(res.headers),
          };
          if (!textual(ct) || len > MAX_BODY) { post({ ...base, size: len, resBody: null }); return; }
          res.clone().text().then((txt) => emitBody(base, txt), () => post(base));
        } catch (_) { /* ignore */ }
      }, (err) => post({ id, t, kind: 'fetch', method, url: abs(url), status: 0, error: String(err), reqBody }));
      return p;
    };
  }

  // ---------- XMLHttpRequest ----------
  const xhrHeaders = (x) => {
    const o = {};
    try {
      for (const line of x.getAllResponseHeaders().split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i < 1) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim();
        if (WATCH.test(k) || WATCH.test(v)) o[k] = v;
      }
    } catch (_) { /* ignore */ }
    return o;
  };
  const xhrMeta = new WeakMap();
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    xhrMeta.set(this, { method: String(method).toUpperCase(), url: abs(url) });
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const meta = xhrMeta.get(this);
    if (meta) {
      meta.id = ++seq;
      meta.t = Date.now();
      meta.reqBody = describeBody(body);
      this.addEventListener('loadend', () => {
        try {
          const ct = this.getResponseHeader('content-type') || '';
          const base = {
            id: meta.id, t: meta.t, kind: 'xhr', method: meta.method, url: meta.url, status: this.status, ctype: ct, reqBody: meta.reqBody, resHeaders: xhrHeaders(this),
          };
          let txt = null;
          if (this.responseType === '' || this.responseType === 'text') txt = this.responseText;
          else if (this.responseType === 'json') txt = JSON.stringify(this.response);
          if (txt != null && textual(ct)) emitBody(base, txt);
          else post({ ...base, size: 0, resBody: null });
        } catch (_) { /* ignore */ }
      });
    }
    return xhrSend.apply(this, arguments);
  };

  // ---------- WebSocket (incl. socket.io frames) ----------
  const frame = (url, dir, data) => {
    if (typeof data !== 'string') return;
    if (!(captureAll || WATCH.test(data))) return;
    post({
      id: ++seq, t: Date.now(), kind: 'ws', method: dir, url: abs(url), status: 101, size: data.length, resBody: dir === 'IN' ? data.slice(0, MAX_BODY) : null, reqBody: dir === 'OUT' ? data.slice(0, 200000) : null,
    });
  };
  if (window.WebSocket) {
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        const url = args[0];
        post({ id: ++seq, t: Date.now(), kind: 'ws', method: 'OPEN', url: abs(url), status: 101, size: 0, resBody: null });
        ws.addEventListener('message', (ev) => frame(url, 'IN', ev.data));
        const send = ws.send;
        ws.send = function (data) { frame(url, 'OUT', data); return send.apply(this, arguments); };
        return ws;
      },
    });
  }

  // ---------- EventSource (SSE) ----------
  if (window.EventSource) {
    window.EventSource = new Proxy(window.EventSource, {
      construct(target, args, newTarget) {
        const es = Reflect.construct(target, args, newTarget);
        const url = args[0];
        post({ id: ++seq, t: Date.now(), kind: 'sse', method: 'OPEN', url: abs(url), status: 200, size: 0, resBody: null });
        es.addEventListener('message', (ev) => {
          if (typeof ev.data === 'string' && (captureAll || WATCH.test(ev.data))) {
            post({ id: ++seq, t: Date.now(), kind: 'sse', method: 'IN', url: abs(url), status: 200, size: ev.data.length, resBody: ev.data.slice(0, MAX_BODY) });
          }
        });
        return es;
      },
    });
  }

  // ---------- Application state (SSR payloads, Vuex/Redux dumps...) ----------
  const seenState = new Map();
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `${s.length}:${h}`;
  };
  const safeStringify = (o) => {
    const seen = new WeakSet();
    try {
      return JSON.stringify(o, (k, v) => {
        if (typeof v === 'function') return undefined;
        if (v && typeof v === 'object') {
          if (seen.has(v)) return undefined;
          seen.add(v);
        }
        return v;
      });
    } catch (_) { return null; }
  };
  const scanState = () => {
    const found = [];
    for (const k of STATE_KEYS) {
      try { if (window[k] != null) found.push([`window.${k}`, window[k]]); } catch (_) { /* ignore */ }
    }
    try {
      document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]').forEach((s, i) => {
        found.push([`script[${s.id || s.type}#${i}]`, s.textContent]);
      });
    } catch (_) { /* ignore */ }
    for (const [name, val] of found) {
      const txt = typeof val === 'string' ? val : safeStringify(val);
      if (!txt || !(captureAll || WATCH.test(txt))) continue;
      const sig = hash(txt);
      if (seenState.get(name) === sig) continue;
      seenState.set(name, sig);
      post({ id: ++seq, t: Date.now(), kind: 'state', method: 'STATE', url: name, status: 200, size: txt.length, resBody: txt.slice(0, MAX_BODY) });
    }
  };
  const later = (ms) => setTimeout(scanState, ms);
  document.addEventListener('DOMContentLoaded', () => later(0));
  window.addEventListener('load', () => { later(0); later(2000); later(6000); });
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); later(800); return r; };
  }
  window.addEventListener('popstate', () => later(800));
  let ticks = 0;
  const iv = setInterval(() => { scanState(); if (++ticks >= 12) clearInterval(iv); }, 5000);

  // ---------- control channel from the content script ----------
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.ch !== `${CH}:cfg`) return;
    if (typeof ev.data.captureAll === 'boolean') captureAll = ev.data.captureAll;
    if (ev.data.rescan) { seenState.clear(); scanState(); }
  });
})();
