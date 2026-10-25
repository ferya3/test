// Injects the panel into the Rubika Web tab when the toolbar icon is clicked,
// and relays API requests the page itself could not make (CORS fallback).

const RUBIKA_WEB = 'https://web.rubika.ir/';
const PANEL_FILES = [
  'lib/xlsx.full.min.js',
  'src/crypto.js',
  'src/session.js',
  'src/api.js',
  'src/excel.js',
  'src/panel.js',
];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.url.startsWith(RUBIKA_WEB)) {
    await chrome.tabs.create({ url: RUBIKA_WEB });
    return;
  }

  const target = { tabId: tab.id };
  const [{ result: mounted }] = await chrome.scripting.executeScript({
    target,
    func: () => Boolean(globalThis.RXG && globalThis.RXG.togglePanel),
  });

  if (mounted) {
    await chrome.scripting.executeScript({ target, func: () => globalThis.RXG.togglePanel() });
  } else {
    await chrome.scripting.executeScript({ target, files: PANEL_FILES });
  }
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
