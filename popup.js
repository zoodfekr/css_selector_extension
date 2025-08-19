/* global chrome */

const state = {
  siteUrl: '',
  sourceName: '',
  sourceImage: '',
  lang: '',
  country: '',
  mainSelectors: {
    container: '',
    title: '',
    summary: '',
    link: ''
  },
  selectors: {
    title: '',
    summary: '',
    link: '',
    category: '',
    date: '',
    content: '',
    image: ''
  }
};

function $(id) { return document.getElementById(id); }

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
    } catch {}
  }
}

async function loadFromStorage() {
  const data = await chrome.storage.local.get(['siteUrl', 'selectors', 'mainSelectors', 'sourceName', 'sourceImage', 'lang', 'country']);
  if (data.siteUrl) state.siteUrl = data.siteUrl;
  if (data.sourceName) state.sourceName = data.sourceName;
  if (data.sourceImage) state.sourceImage = data.sourceImage;
  if (data.lang) state.lang = data.lang;
  if (data.country) state.country = data.country;
  if (data.mainSelectors) Object.assign(state.mainSelectors, data.mainSelectors);
  if (data.selectors) Object.assign(state.selectors, data.selectors);

  $('siteUrl').value = state.siteUrl || '';
  const sourceNameInput = $('sourceName');
  if (sourceNameInput) sourceNameInput.value = state.sourceName || '';
  const sourceImageInput = $('sourceImage');
  if (sourceImageInput) sourceImageInput.value = state.sourceImage || '';
  const langInput = $('lang');
  if (langInput) langInput.value = state.lang || '';
  const countryInput = $('country');
  if (countryInput) countryInput.value = state.country || '';

  $('selector-title').value = state.selectors.title || '';
  $('selector-summary').value = state.selectors.summary || '';
  const mainLinkSel = $('selector-main-link');
  if (mainLinkSel) mainLinkSel.value = state.mainSelectors.link || '';
  const mainContainerSel = $('selector-main-container');
  if (mainContainerSel) mainContainerSel.value = state.mainSelectors.container || '';
  $('selector-category').value = state.selectors.category || '';
  $('selector-date').value = state.selectors.date || '';
  const contentSel = $('selector-content');
  if (contentSel) contentSel.value = state.selectors.content || '';
  const imageSel = $('selector-image');
  if (imageSel) imageSel.value = state.selectors.image || '';
  const mainTitleSel = $('selector-main-title');
  if (mainTitleSel) mainTitleSel.value = state.mainSelectors.title || '';
  const mainSummarySel = $('selector-main-summary');
  if (mainSummarySel) mainSummarySel.value = state.mainSelectors.summary || '';
}

async function saveToStorage() {
  await chrome.storage.local.set({
    siteUrl: state.siteUrl,
    selectors: state.selectors,
    mainSelectors: state.mainSelectors,
    sourceName: state.sourceName,
    sourceImage: state.sourceImage,
    lang: state.lang,
    country: state.country
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

  $('siteUrl').addEventListener('input', async (e) => {
    state.siteUrl = e.target.value.trim();
    await saveToStorage();
  });

  $('sourceName')?.addEventListener('input', async (e) => {
    state.sourceName = e.target.value.trim();
    await saveToStorage();
  });

  $('sourceImage')?.addEventListener('input', async (e) => {
    state.sourceImage = e.target.value.trim();
    await saveToStorage();
  });

  $('lang')?.addEventListener('input', async (e) => {
    state.lang = e.target.value.trim();
    await saveToStorage();
  });

  $('country')?.addEventListener('input', async (e) => {
    state.country = e.target.value.trim();
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

  // Wire selection buttons for MAIN (list page) selectors
  for (const fieldKey of Object.keys(state.mainSelectors)) {
    const btn = document.querySelector(`.btn.select[data-field="main_${fieldKey}"]`);
    const clearBtn = document.querySelector(`.btn.clear[data-field="main_${fieldKey}"]`);

    btn?.addEventListener('click', async () => {
      document.querySelectorAll('.btn.select').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setStatus(`حالت انتخاب «${labelFor('main_' + fieldKey)}» فعال شد. روی المنت موردنظر در صفحه کلیک کنید.`);

      const tab = await getActiveTab();
      if (!tab?.id) return;
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECTION', fieldKey: `main_${fieldKey}` });
    });

    clearBtn?.addEventListener('click', async () => {
      state.mainSelectors[fieldKey] = '';
      const inputEl = document.getElementById(`selector-main-${fieldKey}`);
      if (inputEl) inputEl.value = '';
      await saveToStorage();
      setStatus(`فیلد «${labelFor('main_' + fieldKey)}» پاک شد.`);
    });

    const input = document.getElementById(`selector-main-${fieldKey}`);
    input?.addEventListener('input', async (e) => {
      state.mainSelectors[fieldKey] = e.target.value.trim();
      await saveToStorage();
    });
  }

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
      await ensureContentScript(tab.id);
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
      if (typeof fieldKey === 'string' && fieldKey.startsWith('main_')) {
        const subKey = fieldKey.replace(/^main_/, '');
        if (state.mainSelectors.hasOwnProperty(subKey)) {
          state.mainSelectors[subKey] = selector;
          const input = document.getElementById(`selector-main-${subKey}`);
          if (input) input.value = selector;
          await saveToStorage();
          setStatus(`انتخاب «${labelFor(fieldKey)}» ثبت شد.`);
        }
      } else if (state.selectors.hasOwnProperty(fieldKey)) {
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
    if (area === 'local' && changes.mainSelectors) {
      const newMain = changes.mainSelectors.newValue || {};
      Object.assign(state.mainSelectors, newMain);
      for (const key of Object.keys(state.mainSelectors)) {
        const input = document.getElementById(`selector-main-${key}`);
        if (input) input.value = state.mainSelectors[key] || '';
      }
      setStatus('مقادیر فهرست از ذخیره‌سازی همگام شد.');
    }
  });

  // Submit to backend: fixed endpoint http://localhost:3000/selectors
  $('submitBtn')?.addEventListener('click', async () => {
    try {
      setStatus('در حال ارسال...');
      const payload = {
        name: state.sourceName || '',
        url: state.siteUrl || '',
        container_selector: state.mainSelectors.container || '',
        title_selector: state.mainSelectors.title || '',
        summary_selector: state.mainSelectors.summary || '',
        link_selector: state.mainSelectors.link || '',
        lang: state.lang || '',
        country: state.country || '',
        image: state.sourceImage || '',
        css_selector: {
          title: state.selectors.title || '',
          summary: state.selectors.summary || '',
          date: state.selectors.date || '',
          category: state.selectors.category || '',
          content: state.selectors.content || '',
          image: state.selectors.image || ''
        }
      };

      // Basic client-side validation to avoid backend 400
      const missing = [];
      if (!payload.name) missing.push('نام منبع');
      if (!payload.url) missing.push('آدرس سایت');
      if (!payload.title_selector) missing.push('عنوان در فهرست');
      if (!payload.link_selector) missing.push('لینک در فهرست');
      if (!payload.css_selector.title) missing.push('عنوان صفحه خبر');
      if (!payload.css_selector.content) missing.push('محتوای صفحه خبر');
      if (missing.length) {
        setStatus(`فیلدهای اجباری خالی هستند: ${missing.join('، ')}`, 'error');
        return;
      }

      const res = await fetch('http://localhost:3000/api/selectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let details = '';
        try {
          const text = await res.text();
          details = text?.slice(0, 300) || '';
        } catch {}
        throw new Error(`HTTP ${res.status}${details ? ' - ' + details : ''}`);
      }
      setStatus('ارسال با موفقیت انجام شد.', 'success');
      await resetAll();
    } catch (err) {
      setStatus(`خطا در ارسال: ${err?.message || err}`, 'error');
    }
  });

  // Global reset
  $('resetAllBtn')?.addEventListener('click', async () => { await resetAll(); });
}

async function resetAll() {
  state.siteUrl = '';
  state.sourceName = '';
  state.sourceImage = '';
  state.lang = '';
  state.country = '';
  for (const key of Object.keys(state.mainSelectors)) state.mainSelectors[key] = '';
  for (const key of Object.keys(state.selectors)) state.selectors[key] = '';

  $('siteUrl').value = '';
  const sourceNameInput = $('sourceName'); if (sourceNameInput) sourceNameInput.value = '';
  const sourceImageInput = $('sourceImage'); if (sourceImageInput) sourceImageInput.value = '';
  const langInput = $('lang'); if (langInput) langInput.value = '';
  const countryInput = $('country'); if (countryInput) countryInput.value = '';

  for (const key of Object.keys(state.mainSelectors)) {
    const input = document.getElementById(`selector-main-${key}`);
    if (input) input.value = '';
  }
  for (const key of Object.keys(state.selectors)) {
    const input = document.getElementById(`selector-${key}`);
    if (input) input.value = '';
  }

  await saveToStorage();
  setStatus('تمام مقادیر ریست شد.');
}

function labelFor(key) {
  return ({
    main_container: 'بخش محتوا (فهرست)',
    main_title: 'عنوان (فهرست)',
    main_summary: 'خلاصه (فهرست)',
    main_link: 'لینک (فهرست)',
    title: 'عنوان',
    summary: 'خلاصه',
    link: 'لینک',
    category: 'دسته‌بندی',
    date: 'تاریخ',
    content: 'محتوا',
    image: 'تصویر'
  })[key] || key;
}

init();
