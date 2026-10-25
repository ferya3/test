// Injects the panel into the Rubika Web or Eitaa Web tab when the toolbar icon
// is clicked, and relays Rubika API requests the page itself could not make
// (CORS fallback).

const SITES = {
  'web.rubika.ir': {
    files: ['src/crypto.js', 'src/session.js', 'src/api.js'],
  },
  'web.eitaa.com': {
    files: [],
    // Must run in the page's own world to reach Eitaa Web's managers.
    mainWorld: ['src/eitaa-bridge.js'],
  },
};
const SHARED_FILES = ['lib/xlsx.full.min.js', 'src/excel.js', 'src/backends.js', 'src/panel.js'];

chrome.action.onClicked.addListener(async (tab) => {
  const host = tab.url ? new URL(tab.url).hostname : '';
  const site = SITES[host];
  if (!site) {
    await chrome.tabs.create({ url: 'https://web.rubika.ir/' });
    return;
  }

  const target = { tabId: tab.id };
  const [{ result: mounted }] = await chrome.scripting.executeScript({
    target,
    func: () => Boolean(globalThis.RXG && globalThis.RXG.togglePanel),
  });

  if (mounted) {
    await chrome.scripting.executeScript({ target, func: () => globalThis.RXG.togglePanel() });
    return;
  }
  if (site.mainWorld) {
    await chrome.scripting.executeScript({ target, files: site.mainWorld, world: 'MAIN' });
  }
  await chrome.scripting.executeScript({ target, files: [...site.files, ...SHARED_FILES] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'rxg-fetch') return false;

  const url = new URL(message.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.iranlms.ir')) {
    sendResponse({ ok: false, error: 'host not allowed' });
    return false;
  }

  fetch(url, {
    method: message.method || 'GET',
    headers: message.body ? { 'Content-Type': 'application/json' } : undefined,
    body: message.body,
  })
    .then(async (res) => sendResponse({ ok: res.ok, status: res.status, text: await res.text() }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true;
});
