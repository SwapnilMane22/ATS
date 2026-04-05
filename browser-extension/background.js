/* global chrome */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ATS_OPEN_TAB" && typeof msg.url === "string") {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "http://127.0.0.1:3847/" });
});
