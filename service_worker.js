/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  // Initialization hook
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    if (msg?.type === 'SELECTION_DONE') {
      const { fieldKey, selector } = msg;
      if (!fieldKey) return;

      const existing = await chrome.storage.local.get(['selectors']);
      const selectors = { ...(existing.selectors || {}) };
      selectors[fieldKey] = selector || '';

      await chrome.storage.local.set({ selectors, lastUpdatedAt: Date.now() });

      // Notify any open views (e.g., popup) to refresh
      chrome.runtime.sendMessage({ type: 'SELECTION_SAVED', fieldKey, selector });
    }
  } catch (e) {
    // swallow to avoid breaking message channel
  }
});
