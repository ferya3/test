// Clicking the toolbar icon toggles the panel inside Gmail. On any other page it
// opens Gmail and shows the panel there once the page has loaded.

const GMAIL = 'https://mail.google.com/';

async function togglePanel(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'toggle-panel' });
  } catch {
    // Gmail was already open when the extension was installed, so the content
    // script isn't in the page yet: inject it, then try again.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'toggle-panel' });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith(GMAIL)) {
    await togglePanel(tab.id);
    return;
  }

  const created = await chrome.tabs.create({ url: GMAIL + 'mail/u/0/' });
  const onUpdated = (tabId, info, updated) => {
    if (tabId !== created.id || info.status !== 'complete') return;
    if (!updated.url?.startsWith(GMAIL + 'mail/')) return; // still on the sign-in page
    chrome.tabs.onUpdated.removeListener(onUpdated);
    togglePanel(tabId).catch(() => {});
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
});
