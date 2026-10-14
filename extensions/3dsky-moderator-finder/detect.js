/*
 * Detection engine: finds anything that looks like "who moderates this model"
 * inside a JSON / text payload. No DOM or chrome.* access, so it is testable in Node.
 *
 * strength 3 = key names a moderator            (moderator, moderator_id, assignedModerator, модератор ...)
 * strength 2 = key is about moderation          (moderation_status, moderated_at ...)
 * strength 1 = weak hint                        (reviewer, curator, assigned_to ...)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModFinderDetect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const RE_WHO = /moderator|модератор/i;
  const RE_MOD = /moder|модер/i;
  const RE_WEAK = /review|curat|inspect|assign|approv|verif|examin|expert|supervis|куратор|проверя|проверк|ревью/i;
  const RE_WHO_TEXT = /(?:moderator|модератор\S*)\s*[:：\-–—]\s*\S+|(?:checked|reviewed|assigned|handled|moderated)\s+by\s+\S+|на проверке у\s+\S+/i;
  const RE_CONTEXT = /.{0,60}(?:moderator|модератор).{0,80}/gi;

  const NAME_KEYS = ['nickname', 'nick', 'username', 'user_name', 'login', 'display_name', 'displayName',
    'full_name', 'fullName', 'name', 'title', 'email'];
  const ID_KEYS = ['id', 'uid', 'user_id', 'userId'];

  const MAX_NODES = 150000;
  const MAX_DEPTH = 14;
  const MAX_FINDINGS = 200;

  function keyStrength(k) {
    if (RE_WHO.test(k)) return 3;
    if (RE_MOD.test(k)) return 2;
    if (RE_WEAK.test(k)) return 1;
    return 0;
  }

  const EMPTY = Object.freeze({ text: null, aliasKeys: [], empty: true });

  /** Turn an arbitrary JSON value into a short human-readable value + keys usable for nicknames. */
  function describe(v) {
    if (v === null || v === undefined || v === '') return EMPTY;
    if (Array.isArray(v)) {
      if (!v.length) return EMPTY;
      const ds = v.slice(0, 5).map(describe).filter((d) => !d.empty);
      if (!ds.length) return EMPTY;
      return { text: ds.map((d) => d.text).join(', '), aliasKeys: ds.flatMap((d) => d.aliasKeys), empty: false };
    }
    if (typeof v === 'object') {
      if (!Object.keys(v).length) return EMPTY;
      let name = null;
      let id = null;
      for (const k of NAME_KEYS) {
        const x = v[k];
        if (name == null && x != null && typeof x !== 'object' && x !== '') name = x;
      }
      for (const k of ID_KEYS) {
        const x = v[k];
        if (id == null && x != null && typeof x !== 'object' && x !== '') id = x;
      }
      let text;
      if (name != null && id != null) text = `${name} (#${id})`;
      else if (name != null) text = String(name);
      else if (id != null) text = `#${id}`;
      else text = JSON.stringify(v).slice(0, 160);
      return {
        text,
        aliasKeys: [id, name].filter((x) => x != null).map((x) => String(x)),
        empty: false,
      };
    }
    const s = String(v).slice(0, 200);
    return { text: s, aliasKeys: s.length <= 60 ? [s] : [], empty: false };
  }

  /** Parse JSON, socket.io / engine.io frames ("42[...]") and form-encoded bodies. Returns undefined if none fits. */
  function parseLoose(text) {
    if (typeof text !== 'string') return undefined;
    const s = text.trim();
    if (!s) return undefined;
    if (s[0] === '{' || s[0] === '[') {
      try { return JSON.parse(s); } catch (_) { /* fall through */ }
    }
    const m = /^\d{1,4}(?:-\d+)?(?=[[{])/.exec(s);
    if (m) {
      try { return JSON.parse(s.slice(m[0].length)); } catch (_) { /* fall through */ }
    }
    if (s.length < 20000 && /^[^\s=&]+=[^&]*(&[^\s=&]+=[^&]*)*$/.test(s)) {
      try { return Object.fromEntries(new URLSearchParams(s)); } catch (_) { /* fall through */ }
    }
    return undefined;
  }

  function scanJSON(root) {
    const out = [];
    let nodes = 0;
    const visit = (v, path, depth) => {
      if (out.length >= MAX_FINDINGS || ++nodes > MAX_NODES || depth > MAX_DEPTH) return;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length && i < 500; i++) visit(v[i], `${path}[${i}]`, depth + 1);
        return;
      }
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) {
          const child = v[k];
          const p = path ? `${path}.${k}` : k;
          const strength = keyStrength(k);
          if (strength) {
            const d = describe(child);
            out.push({ strength, path: p, key: k, text: d.text, aliasKeys: d.aliasKeys, empty: d.empty, via: 'json' });
          }
          visit(child, p, depth + 1);
        }
        return;
      }
      if (typeof v === 'string') {
        // JSON nested inside a string field
        if (v.length > 2 && v.length < 200000 && (v[0] === '{' || v[0] === '[') && depth < MAX_DEPTH - 2) {
          try { visit(JSON.parse(v), path, depth + 2); return; } catch (_) { /* plain string */ }
        }
        if (v.length < 300 && RE_WHO.test(v)) {
          out.push({
            strength: RE_WHO_TEXT.test(v) ? 3 : 1, path, key: '(text)', text: v, aliasKeys: [], empty: false, via: 'text',
          });
        }
      }
    };
    visit(root, '', 0);
    return out;
  }

  /** Scan any payload (JSON, socket frame, form body or free text). */
  function scanText(text) {
    if (typeof text !== 'string' || !text) return [];
    const parsed = parseLoose(text);
    if (parsed !== undefined) return scanJSON(parsed);
    if (text.length > 100000 || !RE_MOD.test(text)) return [];
    const out = [];
    const seen = new Set();
    for (const m of text.matchAll(RE_CONTEXT)) {
      const ctx = m[0].replace(/\s+/g, ' ').trim();
      if (seen.has(ctx)) continue;
      seen.add(ctx);
      out.push({
        strength: RE_WHO_TEXT.test(ctx) ? 3 : 1, path: '(text)', key: '(text)', text: ctx, aliasKeys: [], empty: false, via: 'text',
      });
      if (out.length >= 10) break;
    }
    return out;
  }

  /** Response headers: report any header whose name or value looks relevant. */
  function scanHeaders(headers) {
    const out = [];
    for (const [k, v] of Object.entries(headers || {})) {
      const strength = keyStrength(k) || (RE_WHO.test(String(v)) ? 2 : 0);
      if (strength) {
        const d = describe(v);
        out.push({ strength, path: `header:${k}`, key: k, text: d.text, aliasKeys: d.aliasKeys, empty: d.empty, via: 'header' });
      }
    }
    return out;
  }

  return {
    RE_WHO, RE_MOD, RE_WEAK, RE_WHO_TEXT, keyStrength, describe, parseLoose, scanJSON, scanText, scanHeaders,
  };
});
