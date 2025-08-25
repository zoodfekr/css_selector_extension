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

  // === Generalized selector helpers (stable, class-based) ===
  function isLikelyGenerated(name) {
    return /^(ng|_ng|css|jsx|style|chakra|Mui|ant|sc|v)-/i.test(name)
      || /(^|-)\d{3,}($|-)/.test(name)
      || /[A-Fa-f0-9]{6,}/.test(name);
  }

  function isStableClassName(name) {
    if (!name || typeof name !== 'string') return false;
    if (name.length < 3 || name.length > 64) return false;
    if (/^\d+$/.test(name)) return false;
    if (isLikelyGenerated(name)) return false;
    return true;
  }

  function pickMeaningfulClasses(element) {
    const classes = Array.from(element.classList || []).filter(isStableClassName);
    if (classes.length === 0) return [];
    const scored = classes.map(c => ({
      name: c,
      score: (c.includes('__') ? 3 : 0) + (c.includes('-') ? 2 : 0) + (c.length >= 8 ? 1 : 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 2).map(x => x.name);
  }

  function classSelectorFor(element) {
    const chosen = pickMeaningfulClasses(element);
    if (chosen.length === 0) return '';
    return '.' + chosen.map(c => c.replace(/\s+/g, '')).join('.');
  }

  function looksLikeListContainer(element) {
    const listKeywords = /(list|grid|posts|items|results|feed|stream|front|archive|loop)/i;
    return Array.from(element.classList || []).some(c => listKeywords.test(c))
      || /^(ul|ol)$/i.test(element.tagName);
  }

  function findGoodAncestor(element, maxDepth = 6) {
    let depth = 0;
    let current = element.parentElement;
    while (current && depth < maxDepth) {
      const clsSel = classSelectorFor(current);
      if (clsSel && looksLikeListContainer(current)) return current;
      if (clsSel && depth >= 1) return current; // any stable class after at least one hop
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function buildGeneralSelector(element) {
    if (!(element instanceof Element)) return '';
    const selfSel = classSelectorFor(element) || element.tagName.toLowerCase();
    const ancestor = findGoodAncestor(element, 7);
    const ancSel = ancestor ? classSelectorFor(ancestor) : '';
    const selector = ancSel ? `${ancSel} ${selfSel}` : selfSel;
    try { if (element.matches(selector)) return selector; } catch {}
    return selfSel || getUniqueSelector(element);
  }

  function buildDescendantSelector(containerSelector, targetElement) {
    if (!containerSelector || !(targetElement instanceof Element)) return '';
    const selfSel = classSelectorFor(targetElement) || targetElement.tagName.toLowerCase();
    const combined = `${containerSelector} ${selfSel}`;
    try { if (targetElement.matches(combined)) return combined; } catch {}
    // fallback to unique within container using :scope
    try {
      const container = document.querySelector(containerSelector);
      if (container) {
        // attempt to build path within container only
        const segments = [];
        let current = targetElement;
        while (current && current !== container && current.nodeType === 1) {
          const classes = classSelectorFor(current) || current.tagName.toLowerCase();
          segments.unshift(classes);
          current = current.parentElement;
        }
        const scoped = `${containerSelector} ${segments.join(' ')}`.trim();
        if (container.querySelectorAll(scoped.replace(/:scope\s+/g, '')).length > 0) return scoped;
      }
    } catch {}
    return combined;
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
      if (typeof fieldKey === 'string' && fieldKey.startsWith('main_')) {
        const subKey = fieldKey.replace(/^main_/, '');
        const { mainSelectors: existing } = await chrome.storage.local.get(['mainSelectors']);
        const mainSelectors = { ...(existing || {}) };
        mainSelectors[subKey] = selector || '';
        await chrome.storage.local.set({ mainSelectors, lastUpdatedAt: Date.now() });
      } else {
        const { selectors: existing } = await chrome.storage.local.get(['selectors']);
        const selectors = { ...(existing || {}) };
        selectors[fieldKey] = selector || '';
        await chrome.storage.local.set({ selectors, lastUpdatedAt: Date.now() });
      }
    } catch {}
  }

  async function onClick(e) {
    if (!isSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = e.target instanceof Element ? e.target : hoverTarget;
    if (!target) return;

    let selector = getUniqueSelector(target);
    if (typeof currentFieldKey === 'string' && currentFieldKey.startsWith('main_')) {
      // If a main container is present, constrain selectors inside it
      try {
        const { mainSelectors } = await chrome.storage.local.get(['mainSelectors']);
        const container = mainSelectors?.container;
        if (container) {
          selector = buildDescendantSelector(container, target) || selector;
        } else {
          selector = buildGeneralSelector(target);
        }
      } catch {
        selector = buildGeneralSelector(target);
      }
    }

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
    if (msg?.type === 'PING') {
      try { sendResponse && sendResponse({ ok: true }); } catch {}
      return true;
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

  function createOverlayElements(fieldKey) {
    const boxEl = document.createElement('div');
    Object.assign(boxEl.style, {
      position: 'absolute',
      top: '0px', left: '0px', width: '0px', height: '0px',
      borderRadius: '8px',
      boxShadow: fieldKey === 'main_container'
        ? '0 0 0 2px rgba(251,191,36,0.95), 0 0 0 6px rgba(251,191,36,0.25)'
        : '0 0 0 2px rgba(34,211,238,0.9), 0 0 0 6px rgba(34,211,238,0.15)',
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

  // ===== Multi overlays (blue) for all matches of main list fields inside container =====
  const mainMultiOverlays = new Map(); // fieldKey -> { nodes: Element[], boxes: HTMLDivElement[] }

  function createBlueBox() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      top: '0px', left: '0px', width: '0px', height: '0px',
      borderRadius: '8px',
      boxShadow: '0 0 0 2px rgba(34,211,238,0.9), 0 0 0 6px rgba(34,211,238,0.15)',
      background: 'transparent',
      pointerEvents: 'none'
    });
    ensureOverlayContainer();
    overlayContainer.appendChild(el);
    return el;
  }

  function positionMainMultiOverlays(fieldKey) {
    const entry = mainMultiOverlays.get(fieldKey);
    if (!entry) return;
    const { nodes, boxes } = entry;
    for (let i = 0; i < boxes.length; i++) {
      const node = nodes[i];
      const box = boxes[i];
      if (!node?.isConnected) continue;
      const rect = node.getBoundingClientRect();
      const absTop = window.scrollY + rect.top;
      const absLeft = window.scrollX + rect.left;
      box.style.top = `${absTop}px`;
      box.style.left = `${absLeft}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
  }

  function clearMainMultiOverlays(fieldKey) {
    const entry = mainMultiOverlays.get(fieldKey);
    if (!entry) return;
    for (const box of entry.boxes) box.remove();
    mainMultiOverlays.delete(fieldKey);
  }

  function upsertMainMultiOverlays(fieldKey, itemSelector, containerSelector) {
    // Only operate when container exists and selector is provided
    clearMainMultiOverlays(fieldKey);
    if (!itemSelector || !containerSelector) return;
    let container = null;
    try { container = document.querySelector(containerSelector); } catch { container = null; }
    if (!container) return;
    let nodes = [];
    try { nodes = Array.from(container.querySelectorAll(itemSelector)); } catch { nodes = []; }
    if (nodes.length === 0) return;
    // Skip the first match to avoid duplicating the labeled overlay
    const [, ...rest] = nodes;
    if (rest.length === 0) return;
    const boxes = rest.map(() => createBlueBox());
    mainMultiOverlays.set(fieldKey, { nodes: rest, boxes });
    positionMainMultiOverlays(fieldKey);
  }

  function refreshAllOverlays() {
    for (const key of fieldOverlays.keys()) positionFieldOverlay(key);
    for (const key of mainMultiOverlays.keys()) positionMainMultiOverlays(key);
    // content multi overlays refresh handled below
  }

  // ===== Multi overlays for news page content selector (all matches) =====
  const contentMultiOverlays = { nodes: [], boxes: [] };

  function positionContentMultiOverlays() {
    const { nodes, boxes } = contentMultiOverlays;
    for (let i = 0; i < boxes.length; i++) {
      const node = nodes[i];
      const box = boxes[i];
      if (!node?.isConnected) continue;
      const rect = node.getBoundingClientRect();
      const absTop = window.scrollY + rect.top;
      const absLeft = window.scrollX + rect.left;
      box.style.top = `${absTop}px`;
      box.style.left = `${absLeft}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
  }

  function clearContentMultiOverlays() {
    for (const box of contentMultiOverlays.boxes) box.remove();
    contentMultiOverlays.nodes = [];
    contentMultiOverlays.boxes = [];
  }

  function upsertContentMultiOverlays(selector) {
    clearContentMultiOverlays();
    if (!selector) return;

    // Try to find the primary target we already labeled
    const primary = fieldOverlays.get('content')?.target || null;

    // 1) Generalize :nth-of-type parts if present
    let baseSelector = selector;
    try { baseSelector = selector.replace(/:nth-of-type\(\d+\)/g, ''); } catch {}

    // 2) Attempt document-wide query for the generalized selector
    let candidates = [];
    try { candidates = Array.from(document.querySelectorAll(baseSelector)); } catch { candidates = []; }

    // 3) If too broad or empty, fallback to siblings within the same parent
    if ((!candidates || candidates.length <= 1) && primary?.parentElement) {
      const parent = primary.parentElement;
      const tag = primary.tagName.toLowerCase();
      candidates = Array.from(parent.children).filter(el => el.tagName.toLowerCase() === tag);
    }

    // 4) If still empty, as a last resort, use exact selector to collect at least primary
    if (!candidates || candidates.length === 0) {
      try { candidates = Array.from(document.querySelectorAll(selector)); } catch { candidates = []; }
    }

    // Remove the primary node (it already has labeled overlay)
    const rest = candidates.filter(n => n !== primary);
    if (rest.length === 0) return;

    const boxes = rest.map(() => createBlueBox());
    contentMultiOverlays.nodes = rest;
    contentMultiOverlays.boxes = boxes;
    positionContentMultiOverlays();
  }

  // periodic refresh to handle layout shifts
  let rafId = null;
  function loop() {
    refreshAllOverlays();
    positionContentMultiOverlays();
    rafId = window.requestAnimationFrame(loop);
  }
  if (!rafId) rafId = window.requestAnimationFrame(loop);

  window.addEventListener('scroll', () => { refreshAllOverlays(); positionContentMultiOverlays(); }, true);
  window.addEventListener('resize', () => { refreshAllOverlays(); positionContentMultiOverlays(); }, true);

  async function loadSelectorsAndRender() {
    try {
      const { selectors, mainSelectors } = await chrome.storage.local.get(['selectors', 'mainSelectors']);
      const s = selectors || {};
      const m = mainSelectors || {};
      upsertFieldOverlay('main_container', m.container);
      upsertFieldOverlay('main_title', m.title);
      upsertFieldOverlay('main_summary', m.summary);
      upsertFieldOverlay('main_link', m.link);
      // Blue multi-overlays for all titles/summaries inside container
      upsertMainMultiOverlays('main_title', m.title, m.container);
      upsertMainMultiOverlays('main_summary', m.summary, m.container);
      upsertFieldOverlay('title', s.title);
      upsertFieldOverlay('summary', s.summary);
      upsertFieldOverlay('category', s.category);
      upsertFieldOverlay('date', s.date);
      upsertFieldOverlay('content', s.content);
      upsertFieldOverlay('image', s.image);
      // Render multi overlays for content across the page
      upsertContentMultiOverlays(s.content);
    } catch {}
  }

  // sync on storage change
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.selectors) {
      const next = changes.selectors.newValue || {};
      upsertFieldOverlay('title', next.title);
      upsertFieldOverlay('summary', next.summary);
      upsertFieldOverlay('category', next.category);
      upsertFieldOverlay('date', next.date);
      upsertFieldOverlay('content', next.content);
      upsertFieldOverlay('image', next.image);
      upsertContentMultiOverlays(next.content);
    }
    if (area === 'local' && changes.mainSelectors) {
      const nextM = changes.mainSelectors.newValue || {};
      upsertFieldOverlay('main_container', nextM.container);
      upsertFieldOverlay('main_title', nextM.title);
      upsertFieldOverlay('main_summary', nextM.summary);
      upsertFieldOverlay('main_link', nextM.link);
      upsertMainMultiOverlays('main_title', nextM.title, nextM.container);
      upsertMainMultiOverlays('main_summary', nextM.summary, nextM.container);
    }
  });

  // also react immediately when a selection is saved via message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SELECTION_SAVED') {
      upsertFieldOverlay(msg.fieldKey, msg.selector);
      if (msg.fieldKey === 'content') {
        // Trigger content multi overlays immediately after saving
        upsertContentMultiOverlays(msg.selector);
      }
    }
  });

  // initial render
  loadSelectorsAndRender();
})();
