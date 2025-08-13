/* global chrome */

const state = {
  backendUrl: '',
  siteUrl: '',
  selectors: {
    title: '',
    summary: '',
    link: '',
    category: '',
    date: ''
  }
};

function $(id) { return document.getElementById(id); }

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

async function loadFromStorage() {
  const data = await chrome.storage.local.get(['backendUrl', 'siteUrl', 'selectors']);
  if (data.backendUrl) state.backendUrl = data.backendUrl;
  if (data.siteUrl) state.siteUrl = data.siteUrl;
  if (data.selectors) Object.assign(state.selectors, data.selectors);

  $('backendUrl').value = state.backendUrl || '';
  $('siteUrl').value = state.siteUrl || '';
  $('selector-title').value = state.selectors.title || '';
  $('selector-summary').value = state.selectors.summary || '';
  $('selector-link').value = state.selectors.link || '';
  $('selector-category').value = state.selectors.category || '';
  $('selector-date').value = state.selectors.date || '';
}

async function saveToStorage() {
  await chrome.storage.local.set({
    backendUrl: state.backendUrl,
    siteUrl: state.siteUrl,
    selectors: state.selectors
  });
}

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text || '';
  el.className = `status ${type}`.trim();
}

async function init() {
  await loadFromStorage();

  // Pre-fill site URL from active tab if empty
  if (!state.siteUrl) {
    const tab = await getActiveTab();
    if (tab && tab.url) {
      state.siteUrl = tab.url;
      $('siteUrl').value = tab.url;
      await saveToStorage();
    }
  }

  $('backendUrl').addEventListener('input', async (e) => {
    state.backendUrl = e.target.value.trim();
    await saveToStorage();
  });

  $('siteUrl').addEventListener('input', async (e) => {
    state.siteUrl = e.target.value.trim();
    await saveToStorage();
  });

  $('fillFromTab').addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab && tab.url) {
      state.siteUrl = tab.url;
      $('siteUrl').value = tab.url;
      await saveToStorage();
      setStatus('آدرس سایت از تب فعال دریافت شد.');
    }
  });

  // Wire selection buttons
  for (const fieldKey of Object.keys(state.selectors)) {
    const btn = document.querySelector(`.btn.select[data-field="${fieldKey}"]`);
    const clearBtn = document.querySelector(`.btn.clear[data-field="${fieldKey}"]`);

    btn?.addEventListener('click', async () => {
      // Toggle UI state
      document.querySelectorAll('.btn.select').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setStatus(`حالت انتخاب «${labelFor(fieldKey)}» فعال شد. روی المنت موردنظر در صفحه کلیک کنید.`);

      // Start selection on the active tab
      const tab = await getActiveTab();
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECTION', fieldKey });
    });

    clearBtn?.addEventListener('click', async () => {
      state.selectors[fieldKey] = '';
      document.getElementById(`selector-${fieldKey}`).value = '';
      await saveToStorage();
      setStatus(`فیلد «${labelFor(fieldKey)}» پاک شد.`);
    });

    // Two-way data binding for inputs
    const input = document.getElementById(`selector-${fieldKey}`);
    input?.addEventListener('input', async (e) => {
      state.selectors[fieldKey] = e.target.value.trim();
      await saveToStorage();
    });
  }

  // Listen for results from content script or background
  chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    if (msg?.type === 'SELECTION_DONE' || msg?.type === 'SELECTION_SAVED') {
      const { fieldKey, selector } = msg;
      if (state.selectors.hasOwnProperty(fieldKey)) {
        state.selectors[fieldKey] = selector;
        const input = document.getElementById(`selector-${fieldKey}`);
        if (input) input.value = selector;
        await saveToStorage();
        setStatus(`انتخاب «${labelFor(fieldKey)}» ثبت شد.`);
      }
      // Reset active button UI
      document.querySelectorAll('.btn.select').forEach(b => b.classList.remove('active'));
    }
  });

  // React to storage changes (works even if popup was closed during selection)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.selectors) {
      const newSelectors = changes.selectors.newValue || {};
      Object.assign(state.selectors, newSelectors);
      for (const key of Object.keys(state.selectors)) {
        const input = document.getElementById(`selector-${key}`);
        if (input) input.value = state.selectors[key] || '';
      }
      setStatus('مقادیر از ذخیره‌سازی همگام شد.');
    }
  });
}

function labelFor(key) {
  return ({
    title: 'عنوان',
    summary: 'خلاصه',
    link: 'لینک',
    category: 'دسته‌بندی',
    date: 'تاریخ'
  })[key] || key;
}

init();
