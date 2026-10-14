/*
 * Content script (isolated world): receives what hook.js captured, runs the detector,
 * scans the DOM (including hidden nodes, attributes and comments) and renders the panel.
 */
(() => {
  const D = self.ModFinderDetect;
  const CH = '__3dsky_modfinder__';
  const IGNORE_URL = /google|doubleclick|googletagmanager|yandex|facebook|sentry|hotjar|clarity\.ms|mc\.yandex|analytics|adservice/i;
  const MAX_ENTRIES = 500;
  const STRENGTH_LABEL = { 3: 'مدیتور', 2: 'وضعیت بررسی', 1: 'سرنخ ضعیف' };

  const S = {
    findings: new Map(), // key -> finding
    entries: [], // network log
    aliases: {}, // moderator id/name -> nickname chosen by the user
    prefs: { captureAll: true, showWeak: false, v: 2 },
    open: false,
    tab: 'findings',
    filter: '',
    expanded: new Set(),
    audit: null,
    auditBusy: false,
  };

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const clock = (t) => new Date(t).toLocaleTimeString('en-GB');
  const shortUrl = (u) => {
    try { const x = new URL(u, location.href); return x.pathname + (x.search ? '?…' : ''); } catch (_) { return String(u); }
  };
  const normPath = (p) => String(p).replace(/\[\d+\]/g, '[]');
  const aliasFor = (f) => {
    for (const k of f.aliasKeys || []) if (S.aliases[k]) return S.aliases[k];
    return null;
  };
  const display = (f) => aliasFor(f) || f.text;
  const send = (msg) => {
    try { return chrome.runtime.sendMessage(msg); } catch (_) { return undefined; }
  };

  // ------------------------------------------------------------------ persistence
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        chrome.storage.local.set({
          mf: {
            aliases: S.aliases,
            prefs: S.prefs,
            findings: [...S.findings.values()].slice(-300),
            entries: S.entries.slice(-150).map((e) => ({
              ...e, resBody: e.resBody ? e.resBody.slice(0, e.matched ? 20000 : 6000) : null, reqBody: e.reqBody ? String(e.reqBody).slice(0, 4000) : null,
            })),
          },
        });
      } catch (_) { /* extension reloaded */ }
    }, 1000);
  };
  const hydrate = () => {
    try {
      chrome.storage.local.get('mf', ({ mf }) => {
        if (!mf) return;
        Object.assign(S.aliases, mf.aliases || {});
        if (mf.prefs && mf.prefs.v === 2) Object.assign(S.prefs, mf.prefs); // older saved prefs had capture off
        for (const f of mf.findings || []) if (!S.findings.has(f.key)) S.findings.set(f.key, f);
        S.entries = [...(mf.entries || []), ...S.entries].slice(-MAX_ENTRIES);
        syncHook();
        update();
      });
    } catch (_) { /* ignore */ }
  };

  // ------------------------------------------------------------------ findings
  function addFinding(f, ctx) {
    const key = [f.strength, normPath(f.path), f.text, ctx.where].join('|');
    const now = Date.now();
    const old = S.findings.get(key);
    if (old) { old.count += 1; old.last = now; return; }
    const rec = {
      key, strength: f.strength, path: f.path, text: f.text, empty: f.empty, aliasKeys: f.aliasKeys,
      via: f.via, source: ctx.source, where: ctx.where, first: now, last: now, count: 1,
    };
    S.findings.set(key, rec);
    if (rec.strength === 3 && !rec.empty) announce(rec);
  }

  function ingest(entry) {
    if (!entry || IGNORE_URL.test(entry.url || '')) return;
    entry.t = entry.t || Date.now();
    const found = [];
    const tag = (arr, dir) => arr.forEach((f) => found.push({ f, dir }));
    if (entry.resBody) tag(D.scanText(entry.resBody), 'پاسخ');
    if (entry.reqBody) tag(D.scanText(entry.reqBody), 'درخواست');
    if (entry.resHeaders) tag(D.scanHeaders(entry.resHeaders), 'هدر');
    entry.matched = found.length > 0;
    S.entries.push(entry);
    if (S.entries.length > MAX_ENTRIES) S.entries.splice(0, S.entries.length - MAX_ENTRIES);
    for (const { f, dir } of found) {
      addFinding(f, { source: `${entry.kind.toUpperCase()} ${entry.method || ''} · ${dir}`, where: entry.kind === 'state' ? entry.url : shortUrl(entry.url) });
    }
    if (found.length || S.open) { save(); update(); }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.ch !== CH) return;
    try { ingest(ev.data.entry); } catch (_) { /* never break the page */ }
  });

  function syncHook(rescan) {
    window.postMessage({ ch: `${CH}:cfg`, captureAll: S.prefs.captureAll, rescan: !!rescan }, '*');
  }

  // ------------------------------------------------------------------ DOM scanning
  const RE_WHO = D.RE_WHO;

  function elValue(el) {
    try {
      if (el.tagName === 'SELECT') return [...el.selectedOptions].map((o) => o.textContent.trim()).join(', ');
      if ('value' in el && el.value) return String(el.value);
    } catch (_) { /* ignore */ }
    return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }
  const elPath = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `dom:${el.tagName.toLowerCase()}${id}${cls}`;
  };
  function domFinding(strength, path, text, el, via) {
    if (!text) return;
    addFinding({ strength, path, text, aliasKeys: text.length <= 60 ? [text] : [], empty: false, via },
      { source: via === 'comment' ? 'کامنت HTML' : 'DOM', where: location.pathname });
  }

  function checkElement(el) {
    const tag = el.tagName;
    if (tag === 'SCRIPT') {
      const t = el.textContent || '';
      if (t.length < 400000 && RE_WHO.test(t)) {
        for (const f of D.scanText(t).slice(0, 5)) domFinding(1, 'dom:script', f.text, el, 'script');
      }
    } else if (tag !== 'STYLE') {
      for (const a of el.attributes) {
        if (RE_WHO.test(a.name)) {
          domFinding(3, `${elPath(el)}[${a.name}]`, a.value || elValue(el), el, 'attr');
        } else if (a.name !== 'style' && a.value.length < 200 && RE_WHO.test(a.value)) {
          const isId = a.name === 'class' || a.name === 'id' || a.name === 'name';
          domFinding(isId ? 3 : 1, `${elPath(el)}[${a.name}]`, isId ? elValue(el) : a.value, el, 'attr');
        }
      }
    }
  }
  function checkText(node) {
    const t = node.nodeValue.trim().replace(/\s+/g, ' ');
    const parent = node.parentNode;
    if (!t || t.length >= 300 || !RE_WHO.test(t) || !parent || /^(SCRIPT|STYLE)$/.test(parent.tagName)) return;
    domFinding(D.RE_WHO_TEXT.test(t) ? 3 : 1, `dom:text in ${parent.tagName.toLowerCase()}`, t, parent, 'text');
  }
  function scanNode(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
    let node = root;
    let budget = 20000;
    do {
      if (--budget < 0) break;
      if (node.nodeType === 1) checkElement(node);
      else if (node.nodeType === 3) checkText(node);
      else if (node.nodeType === 8) scanComment(node);
    } while ((node = walker.nextNode()));
  }
  function scanComment(node) {
    const t = (node.nodeValue || '').trim().replace(/\s+/g, ' ');
    if (t && t.length < 400 && D.RE_MOD.test(t)) domFinding(D.RE_WHO_TEXT.test(t) ? 3 : 1, 'dom:comment', t, null, 'comment');
  }

  let domTimer = null;
  const pendingDeep = new Set();
  const pendingShallow = new Set();
  function schedule() {
    if (domTimer) return;
    domTimer = setTimeout(() => {
      domTimer = null;
      const deep = [...pendingDeep];
      const shallow = [...pendingShallow];
      pendingDeep.clear();
      pendingShallow.clear();
      try {
        deep.forEach((n) => { if (n.isConnected !== false) scanNode(n); });
        shallow.forEach((n) => { if (n.isConnected !== false) checkElement(n); });
      } catch (_) { /* never break the page */ }
      update();
      save();
    }, 400);
  }
  function startDomWatch() {
    pendingDeep.add(document.documentElement);
    schedule();
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => pendingDeep.add(n));
        else if (m.type === 'characterData') pendingDeep.add(m.target);
        else if (m.type === 'attributes') pendingShallow.add(m.target);
      }
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  // ------------------------------------------------------------------ headline logic
  function headline() {
    const who = [...S.findings.values()].filter((f) => f.strength === 3);
    const structured = (f) => (f.via === 'json' || f.via === 'header' ? 1 : 0); // API data beats scraped page text
    const real = who.filter((f) => !f.empty).sort((a, b) => structured(b) - structured(a) || b.last - a.last);
    if (real.length) return { kind: 'found', f: real[0], others: real.slice(1) };
    if (who.length) return { kind: 'empty', f: who.sort((a, b) => b.last - a.last)[0] };
    return { kind: 'none' };
  }

  let lastAnnounced = '';
  function announce(rec) {
    const txt = String(display(rec) || '');
    if (txt === lastAnnounced) return;
    lastAnnounced = txt;
    send({ type: 'badge', text: txt.replace(/^#/, '').slice(0, 4), color: '#16a34a' });
    flashPill();
  }

  // ------------------------------------------------------------------ UI
  let host; let root; let raf = 0;
  const CSS = `
  :host{all:initial}
  .panel{color-scheme:dark}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
  .pill{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);
    background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;
    box-shadow:0 6px 24px rgba(0,0,0,.35);direction:rtl}
  .pill.flash{animation:fl 1.2s ease 2}
  @keyframes fl{50%{box-shadow:0 0 0 6px rgba(34,197,94,.45)}}
  .dot{width:10px;height:10px;border-radius:50%;background:#6b7280;flex:none}
  .dot.found{background:#22c55e}.dot.empty{background:#f59e0b}
  .pt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .panel{position:fixed;left:16px;bottom:64px;z-index:2147483647;width:min(600px,calc(100vw - 32px));max-height:min(72vh,720px);display:flex;flex-direction:column;
    background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);direction:rtl;font-size:13px;overflow:hidden}
  .panel[hidden]{display:none}
  header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#111827;border-bottom:1px solid #334155}
  header b{font-size:14px}
  button{font:inherit;color:inherit;background:#1f2937;border:1px solid #374151;border-radius:8px;padding:5px 10px;cursor:pointer}
  button:hover{background:#273449}button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
  .tabs{display:flex;gap:4px;padding:8px 10px 0;background:#111827}
  .tab{border-radius:8px 8px 0 0;border-bottom:none;background:transparent;color:#9ca3af}
  .tab.on{background:#0f172a;color:#fff;border-color:#334155}
  .body{padding:12px 14px;overflow:auto;flex:1;min-height:120px}
  .hero{border-radius:12px;padding:14px;margin-bottom:12px;border:1px solid #334155;background:#111827}
  .hero.found{border-color:#16a34a;background:#052e16}.hero.empty{border-color:#d97706;background:#2b1a04}
  .hero .big{font-size:22px;font-weight:700;margin:4px 0;direction:ltr;text-align:right;word-break:break-word}
  .muted{color:#94a3b8;font-size:12px}
  .item{border:1px solid #1f2937;border-radius:10px;padding:9px 11px;margin-bottom:8px;background:#111827}
  .item .v{font-weight:600;direction:ltr;text-align:right;word-break:break-word}
  .ltr{direction:ltr;text-align:left;unicode-bidi:embed;word-break:break-all}
  .tag{display:inline-block;font-size:11px;border-radius:6px;padding:1px 6px;margin-left:6px}
  .t3{background:#14532d;color:#bbf7d0}.t2{background:#1e3a8a;color:#bfdbfe}.t1{background:#374151;color:#d1d5db}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input[type=text]{width:100%;background:#0b1220;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:7px 10px;font:inherit;direction:ltr}
  footer{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 12px;background:#111827;border-top:1px solid #334155}
  label{display:flex;gap:5px;align-items:center;cursor:pointer}
  pre{margin:6px 0 0;background:#0b1220;border-radius:8px;padding:8px;max-height:180px;overflow:auto;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-all;font-size:11px}
  .log{cursor:pointer}.m{font-weight:700;margin-left:6px}.s200{color:#4ade80}.s400{color:#f87171}
  ul{margin:6px 18px 6px 0;padding:0}li{margin:3px 0}
  `;

  function ensureUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = '__3dsky_modfinder_host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="pill" id="pill"><span class="dot" id="dot"></span><span class="pt" id="pt"></span></div>
      <div class="panel" id="panel" hidden></div>`;
    (document.body || document.documentElement).appendChild(host);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
  }
  function flashPill() {
    ensureUI();
    const p = root.getElementById('pill');
    p.classList.remove('flash');
    void p.offsetWidth;
    p.classList.add('flash');
  }
  let lastRender = 0;
  function update() {
    if (raf) return;
    const wait = Math.max(0, 350 - (Date.now() - lastRender));
    raf = setTimeout(() => { raf = 0; lastRender = Date.now(); render(); }, wait);
  }

  function findingHTML(f) {
    const alias = aliasFor(f);
    const key = (f.aliasKeys || [])[0];
    return `<div class="item">
      <div><span class="tag t${f.strength}">${STRENGTH_LABEL[f.strength]}</span>
        <span class="v">${f.empty ? '<i class="muted">(خالی / null)</i>' : esc(alias ? `${alias}  ←  ${f.text}` : f.text)}</span></div>
      <div class="muted ltr">${esc(f.path)}</div>
      <div class="muted">${esc(f.source)} · <span class="ltr">${esc(f.where)}</span> · ${clock(f.last)} · ${f.count}×</div>
      ${key && !f.empty ? `<div class="row" style="margin-top:6px"><button data-act="alias" data-key="${esc(key)}">${alias ? 'ویرایش نام مستعار' : 'اسم‌گذاری روی این مدیتور'}</button></div>` : ''}
    </div>`;
  }

  function tabFindings() {
    const h = headline();
    let hero;
    if (h.kind === 'found') {
      const alias = aliasFor(h.f);
      hero = `<div class="hero found"><div class="muted">آخرین مدیتور شناسایی‌شده</div>
        <div class="big">${esc(alias || h.f.text)}</div>
        ${alias ? `<div class="muted ltr">${esc(h.f.text)}</div>` : ''}
        <div class="muted">منبع: ${esc(h.f.source)} · <span class="ltr">${esc(h.f.where)}</span> · ${clock(h.f.last)}</div></div>`;
    } else if (h.kind === 'empty') {
      hero = `<div class="hero empty"><div><b>فیلد مدیتور در پاسخ سایت هست، ولی هنوز خالی است.</b></div>
        <div class="muted">احتمالاً بعد از پردازش مدل پر می‌شود؛ پنل را باز نگه دارید یا صفحه‌ی «مدل‌های من» را باز کنید.</div>
        <div class="muted ltr">${esc(h.f.path)} @ ${esc(h.f.where)}</div></div>`;
    } else {
      hero = `<div class="hero"><b>هنوز چیزی درباره‌ی مدیتور دیده نشده.</b>
        <div class="muted">آپلود را شروع کنید. اگر سایت اطلاعات مدیتور را اصلاً برای مرورگر نمی‌فرستد، باید سراغ تب «کد سایت» و «لاگ شبکه» بروید.</div></div>`;
    }
    const list = [...S.findings.values()]
      .filter((f) => S.prefs.showWeak || f.strength >= 2)
      .sort((a, b) => b.strength - a.strength || b.last - a.last)
      .slice(0, 100);
    return hero + (list.length ? list.map(findingHTML).join('') : '<div class="muted">موردی برای نمایش نیست.</div>');
  }

  function tabLog() {
    const q = S.filter.trim().toLowerCase();
    const rows = S.entries.slice().reverse()
      .filter((e) => !q || `${e.method} ${e.url} ${e.status}`.toLowerCase().includes(q))
      .slice(0, 150);
    return `<input type="text" id="filter" placeholder="فیلتر آدرس / متد…" value="${esc(S.filter)}">
      <div class="muted" style="margin:6px 0">${S.entries.length} درخواست ثبت شده. ردیف‌های دارای برچسب match بدنه‌شان چیزی شبیه مدیتور داشت. آدرس‌های مالی/لاگین/سبد خرید هرگز ثبت نمی‌شوند.</div>
      ${rows.map((e) => `<div class="item log" data-act="expand" data-id="${e.id}-${e.t}">
        <span class="m">${esc(e.kind)} ${esc(e.method || '')}</span><span class="${e.status >= 400 || !e.status ? 's400' : 's200'}">${e.status || 'ERR'}</span>
        ${e.matched ? '<span class="tag t3">match</span>' : ''}
        <div class="ltr muted">${esc(e.kind === 'state' ? e.url : shortUrl(e.url))}</div>
        ${S.expanded.has(`${e.id}-${e.t}`) ? `${e.reqBody ? `<div class="muted">درخواست:</div><pre>${esc(String(e.reqBody).slice(0, 4000))}</pre>` : ''}
          ${e.resBody ? `<div class="muted">پاسخ:</div><pre>${esc(String(e.resBody).slice(0, 6000))}</pre>` : '<div class="muted">بدنه ذخیره نشده (بدون تطابق). گزینه «ثبت کامل بدنه‌ها» را روشن کنید.</div>'}` : ''}
      </div>`).join('')}`;
  }

  function tabAudit() {
    const a = S.audit;
    let out = '';
    if (S.auditBusy) out = '<div class="muted">در حال خواندن فایل‌های جاوااسکریپت سایت…</div>';
    else if (a && a.error) out = `<div class="hero empty">${esc(a.error)}</div>`;
    else if (a) {
      out = `<div class="muted">${a.scanned} فایل بررسی شد، ${a.failed.length} مورد قابل دریافت نبود.</div>` +
        (a.withHits.length ? a.withHits.map((r) => `<div class="item"><div class="ltr muted">${esc(r.url)}</div>
          ${r.literals.length ? `<div><b>مسیرها / رشته‌ها:</b><ul class="ltr">${r.literals.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${r.hits.length ? `<div><b>زمینه‌ی کد:</b><ul class="ltr">${r.hits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>`).join('')
          : '<div class="hero"><b>در کد سایت هیچ ردپایی از moderator پیدا نشد.</b><div class="muted">یعنی احتمالاً این بخش کلاً از فرانت‌اند حذف شده است.</div></div>');
    }
    return `<div class="muted" style="margin-bottom:8px">فایل‌های JS همین صفحه را می‌خواند و دنبال هر چیز مرتبط با moderator می‌گردد؛
      مثلاً اندپوینت یا کدی که سایت جا گذاشته ولی در UI نشان نمی‌دهد. بهتر است روی صفحه‌ی آپلود اجرا شود.</div>
      <button class="primary" data-act="audit" ${S.auditBusy ? 'disabled' : ''}>اسکن کد سایت</button>
      <div style="margin-top:10px">${out}</div>`;
  }

  function render() {
    ensureUI();
    const h = headline();
    const pill = root.getElementById('pill');
    root.getElementById('dot').className = `dot ${h.kind === 'found' ? 'found' : h.kind === 'empty' ? 'empty' : ''}`;
    root.getElementById('pt').textContent = h.kind === 'found' ? `مدیتور: ${display(h.f)}`
      : h.kind === 'empty' ? 'فیلد مدیتور هست ولی هنوز خالی است' : 'مدیتور: هنوز پیدا نشد';
    pill.title = 'باز / بسته کردن پنل';
    const panel = root.getElementById('panel');
    panel.hidden = !S.open;
    if (!S.open) return;

    const active = root.activeElement;
    const hadFilter = active && active.id === 'filter';
    const caret = hadFilter ? active.selectionStart : 0;
    const tabs = [['findings', 'یافته‌ها'], ['log', 'لاگ شبکه'], ['audit', 'کد سایت']];
    const body = S.tab === 'findings' ? tabFindings() : S.tab === 'log' ? tabLog() : tabAudit();
    const scroll = panel.querySelector('.body');
    const top = scroll ? scroll.scrollTop : 0;
    panel.innerHTML = `<header><b>3dsky Moderator Finder</b><button data-act="close">✕</button></header>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="body">${body}</div>
      <footer>
        <label><input type="checkbox" data-pref="showWeak" ${S.prefs.showWeak ? 'checked' : ''}> سرنخ‌های ضعیف</label>
        <label title="همه‌ی پاسخ‌ها ذخیره شوند (برای عیب‌یابی؛ مصرف حافظه بیشتر)"><input type="checkbox" data-pref="captureAll" ${S.prefs.captureAll ? 'checked' : ''}> ثبت کامل بدنه‌ها</label>
        <span style="flex:1"></span>
        <button data-act="rescan">اسکن مجدد</button>
        <button data-act="export">خروجی JSON</button>
        <button data-act="clear">پاک کردن</button>
      </footer>`;
    const nb = panel.querySelector('.body');
    if (nb) nb.scrollTop = top;
    if (hadFilter) { const f = root.getElementById('filter'); if (f) { f.focus(); f.setSelectionRange(caret, caret); } }
  }

  // ------------------------------------------------------------------ events
  function onClick(ev) {
    const t = ev.target.closest('[data-act],#pill');
    if (!t) return;
    if (t.id === 'pill') { S.open = !S.open; update(); return; }
    const act = t.dataset.act;
    if (act === 'close') S.open = false;
    else if (act === 'tab') S.tab = t.dataset.tab;
    else if (act === 'expand') { const id = t.dataset.id; if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id); }
    else if (act === 'alias') {
      const key = t.dataset.key;
      const v = prompt(`اسم مستعار برای «${key}» (خالی = حذف):`, S.aliases[key] || '');
      if (v !== null) { if (v.trim()) S.aliases[key] = v.trim(); else delete S.aliases[key]; save(); }
    } else if (act === 'rescan') { syncHook(true); scanNode(document.documentElement); }
    else if (act === 'clear') {
      S.findings.clear(); S.entries = []; S.audit = null; S.expanded.clear(); lastAnnounced = '';
      send({ type: 'badge', text: '' }); save();
    } else if (act === 'export') exportJSON();
    else if (act === 'audit') runAudit();
    update();
  }
  function onInput(ev) {
    if (ev.target.id === 'filter') { S.filter = ev.target.value; update(); }
  }
  function onChange(ev) {
    const pref = ev.target.dataset && ev.target.dataset.pref;
    if (!pref) return;
    S.prefs[pref] = ev.target.checked;
    if (pref === 'captureAll') syncHook();
    save(); update();
  }

  function exportJSON() {
    const data = {
      tool: '3dsky-moderator-finder', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(),
      page: location.href, userAgent: navigator.userAgent, aliases: S.aliases,
      findings: [...S.findings.values()], entries: S.entries, codeAudit: S.audit,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `3dsky-moderator-finder-${Date.now()}.json`;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function runAudit() {
    const urls = new Set();
    document.querySelectorAll('script[src],link[rel=modulepreload],link[rel=preload][as=script]').forEach((e) => {
      const u = e.src || e.href;
      if (u) urls.add(u);
    });
    try {
      performance.getEntriesByType('resource').forEach((r) => { if (/\.m?js(\?|$)/i.test(r.name)) urls.add(r.name); });
    } catch (_) { /* ignore */ }
    S.auditBusy = true; S.audit = null; update();
    Promise.resolve(send({ type: 'audit', urls: [...urls] })).then((res) => {
      S.audit = res || { error: 'پاسخی از سرویس‌ورکر نیامد؛ افزونه را reload کنید.' };
    }, (e) => { S.audit = { error: String(e) }; }).finally(() => { S.auditBusy = false; save(); update(); });
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'toggle') { S.open = !S.open; update(); }
    });
  } catch (_) { /* ignore */ }

  // ------------------------------------------------------------------ boot
  hydrate();
  syncHook();
  const boot = () => { ensureUI(); startDomWatch(); update(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
