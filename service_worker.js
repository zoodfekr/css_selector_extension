/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  // Initialization hook
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    if (msg?.type === 'PING') {
      sendResponse && sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'SELECTION_DONE') {
      const { fieldKey, selector } = msg;
      if (!fieldKey) return;

      // Maintain both mainSelectors and selectors depending on key
      if (typeof fieldKey === 'string' && fieldKey.startsWith('main_')) {
        const subKey = fieldKey.replace(/^main_/, '');
        const existing = await chrome.storage.local.get(['mainSelectors']);
        const mainSelectors = { ...(existing.mainSelectors || {}) };
        mainSelectors[subKey] = selector || '';
        await chrome.storage.local.set({ mainSelectors, lastUpdatedAt: Date.now() });
      } else {
        const existing = await chrome.storage.local.get(['selectors']);
        const selectors = { ...(existing.selectors || {}) };
        selectors[fieldKey] = selector || '';
        await chrome.storage.local.set({ selectors, lastUpdatedAt: Date.now() });
      }

      // Notify any open views (e.g., popup) to refresh
      chrome.runtime.sendMessage({ type: 'SELECTION_SAVED', fieldKey, selector });
    }
  } catch (e) {
    // swallow to avoid breaking message channel
  }
});
