// The work runs in a full tab rather than a popup: a popup closes as soon as it
// loses focus, which would abort a long deletion halfway through.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
