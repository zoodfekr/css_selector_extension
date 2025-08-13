/* global chrome */

(function () {
  const HIGHLIGHT_BORDER_COLOR = '#22d3ee';
  const HIGHLIGHT_BG_COLOR = 'rgba(34, 211, 238, 0.15)';

  let isSelecting = false;
  let currentFieldKey = null;
  let hoverTarget = null;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0px', left: '0px', width: '0px', height: '0px',
    background: HIGHLIGHT_BG_COLOR,
    outline: `2px solid ${HIGHLIGHT_BORDER_COLOR}`,
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'all 0.02s ease-out'
  });

  const label = document.createElement('div');
  label.textContent = 'برای انتخاب کلیک کنید';
  Object.assign(label.style, {
    position: 'fixed',
    padding: '4px 8px',
    background: '#0b1220',
    color: '#e5e7eb',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    fontSize: '12px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transform: 'translateY(-110%)',
    whiteSpace: 'nowrap'
  });

  function ensureOverlay() {
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);
    if (!label.isConnected) document.documentElement.appendChild(label);
  }

  function removeOverlay() {
    overlay.remove();
    label.remove();
  }

  function updateOverlayFor(target) {
    if (!target || !(target instanceof Element)) return;
    const rect = target.getBoundingClientRect();
    overlay.style.top = `${window.scrollY + rect.top}px`;
    overlay.style.left = `${window.scrollX + rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    label.style.top = `${Math.max(0, rect.top - 8)}px`;
    label.style.left = `${Math.max(0, rect.left)}px`;
  }

  function isIdUnique(id) {
    try {
      return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
    } catch { return false; }
  }

  function buildSimpleClassSelector(element) {
    const classList = Array.from(element.classList || []);
    if (classList.length === 0) return '';
    const filtered = classList
      .filter(c => c && !/^(ng|css|jsx|style)-/i.test(c))
      .slice(0, 3);
    if (filtered.length === 0) return '';
    return '.' + filtered.map(c => c.replace(/\s+/g, '')).join('.');
  }

  function indexWithinType(element) {
    let idx = 1;
    let prev = element.previousElementSibling;
    while (prev) {
      if (prev.tagName === element.tagName) idx += 1;
      prev = prev.previousElementSibling;
    }
    return idx;
  }

  function getUniqueSelector(element) {
    if (!(element instanceof Element)) return '';

    if (element.id && isIdUnique(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }

    const segments = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      let segment = tag;

      const id = current.id;
      if (id && isIdUnique(id)) {
        segment = `#${CSS.escape(id)}`;
        segments.unshift(segment);
        break;
      }

      const cls = buildSimpleClassSelector(current);
      segment += cls;

      const parent = current.parentElement;
      if (parent) {
        const sameTypeSiblings = Array.from(parent.children).filter(ch => ch.tagName === current.tagName);
        if (sameTypeSiblings.length > 1) {
          const idx = indexWithinType(current);
          segment += `:nth-of-type(${idx})`;
        }
      }

      segments.unshift(segment);

      const selectorSoFar = segments.join(' > ');
      try {
        const nodes = document.querySelectorAll(selectorSoFar);
        if (nodes.length === 1) {
          return selectorSoFar;
        }
      } catch (e) {
        // ignore invalid selectors in progress
      }

      current = current.parentElement;
    }

    // fallback to full path
    const fallback = segments.join(' > ');
    return fallback || '*';
  }

  function onMouseMove(e) {
    if (!isSelecting) return;
    const target = e.target;
    if (target && target !== document.documentElement && target !== document.body) {
      hoverTarget = target;
      ensureOverlay();
      updateOverlayFor(target);
    }
  }

  async function persistSelection(fieldKey, selector) {
    try {
      const { selectors: existing } = await chrome.storage.local.get(['selectors']);
      const selectors = { ...(existing || {}) };
      selectors[fieldKey] = selector || '';
      await chrome.storage.local.set({ selectors, lastUpdatedAt: Date.now() });
    } catch {}
  }

  async function onClick(e) {
    if (!isSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = e.target instanceof Element ? e.target : hoverTarget;
    if (!target) return;

    const selector = getUniqueSelector(target);

    // persist first to survive popup closing
    await persistSelection(currentFieldKey, selector);

    // cleanup selection mode
    teardownSelection();

    chrome.runtime.sendMessage({ type: 'SELECTION_SAVED', fieldKey: currentFieldKey, selector });
  }

  function onKeyDown(e) {
    if (!isSelecting) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      teardownSelection();
    }
  }

  function setupSelection(fieldKey) {
    currentFieldKey = fieldKey;
    isSelecting = true;
    ensureOverlay();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function teardownSelection() {
    isSelecting = false;
    currentFieldKey = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    removeOverlay();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'START_SELECTION') {
      try { teardownSelection(); } catch {}
      setupSelection(msg.fieldKey);
    }
  });

  // ============ Persistent labeled overlays for saved selectors ============
  const overlayContainer = document.createElement('div');
  Object.assign(overlayContainer.style, {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '0px',
    height: '0px',
    pointerEvents: 'none',
    zIndex: '2147483646'
  });

  function ensureOverlayContainer() {
    if (!overlayContainer.isConnected) document.documentElement.appendChild(overlayContainer);
  }

  const fieldOverlays = new Map(); // fieldKey -> { selector, target, boxEl, chipEl }

  function labelForField(key) {
    return ({
      title: 'عنوان',
      summary: 'خلاصه',
      link: 'لینک',
      category: 'دسته‌بندی',
      date: 'تاریخ'
    })[key] || key;
  }

  function createOverlayElements(fieldKey) {
    const boxEl = document.createElement('div');
    Object.assign(boxEl.style, {
      position: 'absolute',
      top: '0px', left: '0px', width: '0px', height: '0px',
      borderRadius: '8px',
      boxShadow: '0 0 0 2px rgba(34,211,238,0.9), 0 0 0 6px rgba(34,211,238,0.15)',
      background: 'transparent',
      pointerEvents: 'none'
    });

    const chipEl = document.createElement('div');
    chipEl.textContent = labelForField(fieldKey);
    Object.assign(chipEl.style, {
      position: 'absolute',
      transform: 'translate(-2px, -100%)',
      padding: '3px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      color: '#0b1220',
      background: 'linear-gradient(135deg, #22d3ee, #6366f1)',
      border: '1px solid rgba(255,255,255,0.2)',
      fontWeight: '700',
      letterSpacing: '0.2px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 10px rgba(0,0,0,0.25)'
    });

    ensureOverlayContainer();
    overlayContainer.appendChild(boxEl);
    overlayContainer.appendChild(chipEl);

    return { boxEl, chipEl };
  }

  function positionFieldOverlay(fieldKey) {
    const entry = fieldOverlays.get(fieldKey);
    if (!entry) return;
    const { target, boxEl, chipEl } = entry;
    if (!target?.isConnected) return;

    const rect = target.getBoundingClientRect();
    const absTop = window.scrollY + rect.top;
    const absLeft = window.scrollX + rect.left;

    boxEl.style.top = `${absTop}px`;
    boxEl.style.left = `${absLeft}px`;
    boxEl.style.width = `${rect.width}px`;
    boxEl.style.height = `${rect.height}px`;

    chipEl.style.top = `${absTop}px`;
    chipEl.style.left = `${absLeft}px`;
  }

  function upsertFieldOverlay(fieldKey, selector) {
    if (!selector) {
      removeFieldOverlay(fieldKey);
      return;
    }
    let target;
    try { target = document.querySelector(selector); } catch { target = null; }
    if (!target) {
      removeFieldOverlay(fieldKey);
      return;
    }

    let entry = fieldOverlays.get(fieldKey);
    if (!entry) {
      const els = createOverlayElements(fieldKey);
      entry = { selector, target, ...els };
      fieldOverlays.set(fieldKey, entry);
    } else {
      entry.selector = selector;
      entry.target = target;
    }

    positionFieldOverlay(fieldKey);
  }

  function removeFieldOverlay(fieldKey) {
    const entry = fieldOverlays.get(fieldKey);
    if (!entry) return;
    entry.boxEl?.remove();
    entry.chipEl?.remove();
    fieldOverlays.delete(fieldKey);
  }

  function refreshAllOverlays() {
    for (const key of fieldOverlays.keys()) positionFieldOverlay(key);
  }

  // periodic refresh to handle layout shifts
  let rafId = null;
  function loop() {
    refreshAllOverlays();
    rafId = window.requestAnimationFrame(loop);
  }
  if (!rafId) rafId = window.requestAnimationFrame(loop);

  window.addEventListener('scroll', refreshAllOverlays, true);
  window.addEventListener('resize', refreshAllOverlays, true);

  async function loadSelectorsAndRender() {
    try {
      const { selectors } = await chrome.storage.local.get(['selectors']);
      const s = selectors || {};
      upsertFieldOverlay('title', s.title);
      upsertFieldOverlay('summary', s.summary);
      upsertFieldOverlay('link', s.link);
      upsertFieldOverlay('category', s.category);
      upsertFieldOverlay('date', s.date);
    } catch {}
  }

  // sync on storage change
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.selectors) {
      const next = changes.selectors.newValue || {};
      upsertFieldOverlay('title', next.title);
      upsertFieldOverlay('summary', next.summary);
      upsertFieldOverlay('link', next.link);
      upsertFieldOverlay('category', next.category);
      upsertFieldOverlay('date', next.date);
    }
  });

  // also react immediately when a selection is saved via message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SELECTION_SAVED') {
      upsertFieldOverlay(msg.fieldKey, msg.selector);
    }
  });

  // initial render
  loadSelectorsAndRender();
})();
