// Service worker: toolbar click toggles the panel, shows a badge, and audits the site's JS bundles.

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'badge' && sender.tab) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.text || '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: msg.color || '#16a34a' });
    return false;
  }
  if (msg && msg.type === 'audit') {
    audit(msg.urls || []).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // async response
  }
  return false;
});

// ---- Code audit: grep the site's own JS bundles for leftover moderator code / endpoints ----
const HIT = /.{0,70}(?:moder[a-z_]*|модератор[а-я]*).{0,90}/gi;
const PATH_LITERAL = /["'`]([^"'`\s]{0,120}moder[^"'`\s]{0,120})["'`]/gi;
const MAX_SCRIPT = 12 * 1024 * 1024;

async function auditOne(url) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}` };
    const txt = (await res.text()).slice(0, MAX_SCRIPT);
    const hits = new Set();
    for (const m of txt.matchAll(HIT)) {
      hits.add(m[0].replace(/\s+/g, ' ').trim());
      if (hits.size >= 15) break;
    }
    const literals = new Set();
    for (const m of txt.matchAll(PATH_LITERAL)) {
      literals.add(m[1]);
      if (literals.size >= 40) break;
    }
    return { url, ok: true, size: txt.length, hits: [...hits], literals: [...literals] };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function audit(urls) {
  const list = [...new Set(urls)].slice(0, 120);
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const u = list[i++];
      results.push(await auditOne(u));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return {
    scanned: results.length,
    failed: results.filter((r) => !r.ok).map((r) => ({ url: r.url, error: r.error })),
    withHits: results.filter((r) => r.ok && (r.hits.length || r.literals.length)),
  };
}
