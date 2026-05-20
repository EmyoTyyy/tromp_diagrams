// ═══════════════════════════════════════
// VISUALIZER APP — multi-pane orchestrator
//
// Per-pane state lives in Pane instances (js/ui/pane.js).
// This file manages:
//   - global display settings (color, anim, speed, parens) shared by all panes
//   - the pane container, add-pane button, sync controls
//   - presentation mode (operates on all panes / first pane)
//   - sidebar (defs are global)
//   - global URL handling on initial load
// ═══════════════════════════════════════

// Adapter so older modules find a single "current input" — used by autocomplete.
let _currentInputAdapter = null;

// ── Autocomplete glue ─────────────────────────────
function updateAutocompleteFor(pane) {
  // Build adapter that mimics the textarea/input API but delegates to the pane's editor
  const editor = pane.editor;
  _currentInputAdapter = {
    get value() { return editor.getValue(); },
    set value(v) { editor.setValue(v); },
    selectionStart: editor.selectionStart || 0,
    setSelectionRange: (a) => editor.setSelectionRange(a),
    classList: editor.el.classList,
    focus: () => editor.focus(),
    _pane: pane,
    _list: pane.acList,
  };
  paneUpdateAutocomplete(pane);
}

// ── Per-pane autocomplete (uses pane's own list element) ──────
// Note: acSelected/acOptions are declared in autocomplete.js (legacy module).
// We reuse them here.

function getCaretWord(text, caret) {
  let s = caret, e = caret;
  while (s > 0 && /[a-zA-Z0-9_']/.test(text[s - 1])) s--;
  while (e < text.length && /[a-zA-Z0-9_']/.test(text[e])) e++;
  return { word: text.slice(s, e), start: s, end: e };
}

function paneUpdateAutocomplete(pane) {
  const editor = pane.editor;
  const list = pane.acList;
  // User-disabled via Settings — keep the list closed and bail before
  // doing any caret / word scanning. Cheap enough that the check on
  // every keystroke is fine.
  if (typeof SETTINGS !== 'undefined' && SETTINGS.disableAutocomplete) {
    list.classList.remove('open');
    acOptions = [];
    return;
  }
  const text = editor.getValue();
  const caret = editor.selectionStart || text.length;
  const { word, start } = getCaretWord(text, caret);
  if (!word || word.length < 1 || /^\d+$/.test(word)) {
    list.classList.remove('open');
    acOptions = [];
    return;
  }
  // Skip suggestions when the word is the binding name of a `let` form:
  // in `let foo = …`, foo is being introduced, not consumed — autofilling
  // it from existing defs would be misleading.
  const beforeWord = text.slice(0, start).trimEnd();
  if (/(?:^|[\s(])let$/.test(beforeWord)) {
    list.classList.remove('open');
    acOptions = [];
    return;
  }
  // The keywords `let` and `in` are reserved syntax. If the user is typing
  // a prefix of one of them, suppress autocomplete so the keyword can be
  // typed cleanly without being replaced by a definition like `iszero`.
  // Only kicks in inside a let-expression so other expressions still get
  // suggestions for words starting with i / l.
  if (/^(i|in|l|le|let)$/.test(word) && /(?:^|[\s(])let\s+\S/.test(beforeWord)) {
    list.classList.remove('open');
    acOptions = [];
    return;
  }
  const defs = allDefs();
  const lc = word.toLowerCase();
  const matches = Object.keys(defs).filter(n => n.toLowerCase().startsWith(lc)).slice(0, 8);
  if (matches.length === 0) { list.classList.remove('open'); acOptions = []; return; }
  acOptions = matches;
  acSelected = 0;
  paneRenderAutocomplete(pane);
  list.classList.add('open');
}

function paneRenderAutocomplete(pane) {
  const list = pane.acList;
  const defs = allDefs();
  list.innerHTML = '';
  acOptions.forEach((name, i) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item' + (i === acSelected ? ' selected' : '');
    item.innerHTML = `<span class="autocomplete-name">${name}</span><span class="autocomplete-expr">${escapeHTML(defs[name].replace(/\\/g, 'λ'))}</span>`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      paneAcceptAutocomplete(pane, name);
    });
    list.appendChild(item);
  });
}

function paneAcceptAutocomplete(pane, name) {
  const editor = pane.editor;
  const text = editor.getValue();
  const caret = editor.selectionStart || text.length;
  const { start, end } = getCaretWord(text, caret);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const needSp = after.length > 0 && !/^\s/.test(after) && !/^\)/.test(after);
  const insertion = name + (needSp ? ' ' : '');
  editor.setValue(before + insertion + after);
  editor.setSelectionRange(before.length + insertion.length);
  editor.focus();
  pane.acList.classList.remove('open');
  pane.validate();
}

// ── Insert def name into active pane (called by sidebar) ──
function insertIntoExpr(name) {
  const pane = getActivePane() || ALL_PANES[0];
  if (!pane) return;
  const editor = pane.editor;
  const text = editor.getValue();
  const caret = editor.selectionStart || text.length;
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const needSpaceBefore = before.length > 0 && !/\s$/.test(before) && !/[(\\.]$/.test(before);
  const needSpaceAfter = after.length > 0 && !/^\s/.test(after) && !/^[)\s]/.test(after);
  const insert = (needSpaceBefore ? ' ' : '') + name + (needSpaceAfter ? ' ' : '');
  editor.setValue(before + insert + after);
  editor.setSelectionRange(before.length + insert.length);
  editor.focus();
  pane.validate();
}

// ── Settings (persisted) ──────────────────────────
// Centralised on/off preferences surfaced via the ⚙ Settings modal.
// Persisted to localStorage so they survive reloads; loaded on init.
// Each toggle delegates to an apply function that mutates the older
// globals (COLOR_MODE, ANIM_ENABLED, …) and re-renders as needed, so
// the rest of the pipeline doesn't have to know about SETTINGS at all.
const SETTINGS_KEY = 'tromp_visualizer_settings_v1';
// ── Toolbar shortcut registry ────────────────────────
// Items the user can pin to the global toolbar via Settings → Toolbar
// shortcuts. Order in SETTINGS.toolbar is the order rendered (pinning
// appends, unpinning removes). Scale + speed render as sliders, all
// others as toggle buttons. To make a new SETTINGS key pinnable, add
// it here with a short label + tooltip.
const MAX_TOOLBAR = 6;
const PINNABLE_LABELS = {
  scale:               { label: 'Scale',           tooltip: 'Diagram scale' },
  speed:               { label: 'Speed',           tooltip: 'Animation speed' },
  color:               { label: 'Color',           tooltip: 'Color-code variables' },
  anim:                { label: 'Anim',            tooltip: 'Animate transitions' },
  parens:              { label: 'Parens',          tooltip: 'Show explicit parentheses' },
  sideBySide:          { label: 'Side-by-side',    tooltip: 'Stack panes side-by-side' },
  hideSidebar:         { label: 'No sidebar',      tooltip: 'Hide Definitions sidebar' },
  disableAutocomplete: { label: 'No autoc.',       tooltip: 'Disable autocomplete' },
  sync:                { label: 'Sync',            tooltip: 'Sync step/run/reset across panes' },
  showRecord:          { label: 'Record',          tooltip: 'Show record button (beta)' },
  godMode:             { label: 'God mode',        tooltip: 'Headless fast reduction' },
  defaultBlc:          { label: 'BLC',             tooltip: 'Show BLC on new panes' },
  defaultRecog:        { label: 'Recog',           tooltip: 'Show Recognize on new panes' },
};
const SETTINGS_DEFAULTS = {
  color: false,
  anim: true,
  parens: false,
  sideBySide: false,
  hideSidebar: false,
  disableAutocomplete: false,
  sync: false,
  showRecord: false,
  // Per-pane reduction defaults — read by the Pane constructor each time
  // a new pane is opened. Don't retroactively affect existing panes:
  // changing the default mid-session would override whatever the user
  // had locally selected, which is more surprising than helpful.
  defaultStrategy: 'normal',
  defaultMaxSteps: '1000',
  defaultBlc: false,
  defaultRecog: false,
  // God mode: a no-rendering reduction mode for big terms. Hides the
  // diagram + pretty printer + most pane controls; Run blasts through
  // β-reductions as fast as possible and displays only the final result.
  godMode: false,
  // Which fast-access shortcuts appear in the global toolbar, and in
  // which order. Default mirrors what used to be hard-coded in the
  // markup (scale slider, speed slider, three pinned toggles).
  toolbar: ['scale', 'speed', 'color', 'parens', 'sync'],
};
let SETTINGS = { ...SETTINGS_DEFAULTS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so a settings file written by an older version
      // (missing newer keys) still loads cleanly with sensible defaults.
      SETTINGS = { ...SETTINGS_DEFAULTS, ...parsed };
    }
  } catch { /* corrupted storage — fall back to defaults */ }
  // Sanitize the toolbar list: must be an array, only known keys, and
  // not over MAX. Guards against hand-edited or stale localStorage.
  if (!Array.isArray(SETTINGS.toolbar)) {
    SETTINGS.toolbar = [...SETTINGS_DEFAULTS.toolbar];
  }
  SETTINGS.toolbar = SETTINGS.toolbar
    .filter(k => PINNABLE_LABELS[k] !== undefined);
  // De-duplicate while preserving first-seen order.
  SETTINGS.toolbar = SETTINGS.toolbar.filter((k, i) => SETTINGS.toolbar.indexOf(k) === i);
  if (SETTINGS.toolbar.length > MAX_TOOLBAR) {
    SETTINGS.toolbar.length = MAX_TOOLBAR;
  }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }
  catch { /* private mode / quota — ignore */ }
}

function loadAndApplySettings() {
  loadSettings();
  applyAllSettings();
  // Toolbar is purely UI — build it after settings are applied so
  // toggle buttons reflect the correct ON/OFF state immediately.
  rebuildToolbarShortcuts();
  syncPinUI();
}

// ── Toolbar shortcuts (dynamic) ──────────────────────
// Renders SETTINGS.toolbar into #toolbarShortcuts. Called on init and
// whenever the user pins/unpins. Slider values are snapshotted from
// the existing DOM before re-render so they survive the rebuild.
function rebuildToolbarShortcuts() {
  const host = document.getElementById('toolbarShortcuts');
  if (!host) return;
  // Preserve slider state across rebuild
  const oldSc = host.querySelector('#sc');
  const oldSpeed = host.querySelector('#speed');
  const oldSpeedLabel = host.querySelector('#speedv');
  const scaleValue = oldSc ? oldSc.value : (typeof SCALE !== 'undefined' ? SCALE : 8);
  const speedValue = oldSpeed ? oldSpeed.value : 9;
  const speedLabel = oldSpeedLabel ? oldSpeedLabel.textContent : '1.0x';

  host.innerHTML = SETTINGS.toolbar.map(key => {
    if (key === 'scale') {
      return `<div class="scr"><span>scale:</span>` +
             `<input type="range" id="sc" min="2" max="24" value="${scaleValue}" oninput="setScale(this.value)">` +
             `<span id="scv">${scaleValue}px</span></div>`;
    }
    if (key === 'speed') {
      return `<div class="scr"><span>speed:</span>` +
             `<input type="range" id="speed" min="1" max="20" value="${speedValue}" oninput="setSpeed(this.value)">` +
             `<span id="speedv">${speedLabel}</span></div>`;
    }
    const meta = PINNABLE_LABELS[key];
    if (!meta) return '';
    return `<button class="btn btn-toggle tt" data-tt="${meta.tooltip}" data-tt-pos="below" ` +
           `id="${key}Btn" data-setting="${key}" onclick="toggleSetting('${key}')">` +
           `${meta.label}: OFF</button>`;
  }).join('');

  // syncSettingToggleUI updates each toggle button's label + .active class
  syncSettingToggleUI();
}

// Update every per-row pin button in the modal to reflect the current
// SETTINGS.toolbar membership. Unpinned rows go .disabled once the
// toolbar hits MAX so the user can't blow past the limit.
function syncPinUI() {
  const pinnedCount = SETTINGS.toolbar.length;
  const full = pinnedCount >= MAX_TOOLBAR;
  document.querySelectorAll('.setting-pin').forEach(btn => {
    const row = btn.closest('[data-pin]');
    if (!row) return;
    const key = row.getAttribute('data-pin');
    const pinned = SETTINGS.toolbar.includes(key);
    btn.classList.toggle('pinned', pinned);
    btn.classList.toggle('disabled', !pinned && full);
    btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  });
  const counter = document.getElementById('pinCount');
  if (counter) counter.textContent = pinnedCount + ' / ' + MAX_TOOLBAR;
}

function togglePin(key) {
  if (!PINNABLE_LABELS[key]) return;
  const idx = SETTINGS.toolbar.indexOf(key);
  if (idx >= 0) {
    SETTINGS.toolbar.splice(idx, 1);
  } else {
    if (SETTINGS.toolbar.length >= MAX_TOOLBAR) {
      if (typeof showToast === 'function') {
        showToast('Toolbar full — unpin something first', 'warn');
      }
      return;
    }
    SETTINGS.toolbar.push(key);
  }
  saveSettings();
  rebuildToolbarShortcuts();
  syncPinUI();
}

// Push every setting through its apply function. Used on initial load
// (to make the live state match what was persisted) and after a "Reset
// to defaults" so the UI updates without a reload.
function applyAllSettings() {
  applySetting('color',               SETTINGS.color);
  applySetting('anim',                SETTINGS.anim);
  applySetting('parens',              SETTINGS.parens);
  applySetting('sideBySide',          SETTINGS.sideBySide);
  applySetting('hideSidebar',         SETTINGS.hideSidebar);
  applySetting('disableAutocomplete', SETTINGS.disableAutocomplete);
  applySetting('sync',                SETTINGS.sync);
  applySetting('showRecord',          SETTINGS.showRecord);
  applySetting('godMode',             SETTINGS.godMode);
  // The Reduction defaults section has no live side-effect — values are
  // read fresh on each new-pane construction. We only sync the UI here.
  syncSettingToggleUI();
}

// Reflect each SETTINGS value into the matching toggle button's pressed
// state + .on class. Called on load and after every toggle so the modal
// always matches the live state, even if a setting was changed by some
// other path (e.g. a back-compat call to the old toggleColor()).
function syncSettingToggleUI() {
  const ids = {
    color: 'setColor', anim: 'setAnim', parens: 'setParens',
    sideBySide: 'setLayout', hideSidebar: 'setHideSidebar',
    disableAutocomplete: 'setNoAutocomplete', sync: 'setSync',
    showRecord: 'setRecord',
    defaultBlc: 'setBlc', defaultRecog: 'setRecog',
    godMode: 'setGodMode',
  };
  for (const k of Object.keys(ids)) {
    const btn = document.getElementById(ids[k]);
    if (!btn) continue;
    const on = !!SETTINGS[k];
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // Mirror the non-toggle inputs too so resetSettings() / page reload
  // restore their visible values.
  const stratEl = document.getElementById('setStrategy');
  if (stratEl) stratEl.value = SETTINGS.defaultStrategy;
  const maxEl = document.getElementById('setMaxSteps');
  if (maxEl) maxEl.value = SETTINGS.defaultMaxSteps;

  // Toolbar mirrors — the dynamic shortcut buttons inside the
  // #toolbarShortcuts container all carry data-setting=<key>. Each
  // gets its label + .active class refreshed to match SETTINGS so
  // ON/OFF text and accent-coloured fill stay accurate after any
  // change.
  const tbBtns = document.querySelectorAll('#toolbarShortcuts [data-setting]');
  for (const btn of tbBtns) {
    const key = btn.getAttribute('data-setting');
    const meta = PINNABLE_LABELS[key];
    if (!meta) continue;
    const on = !!SETTINGS[key];
    btn.classList.toggle('active', on);
    btn.textContent = meta.label + ': ' + (on ? 'ON' : 'OFF');
  }
}

// For inputs that aren't simple on/off toggles. Validation lives next
// to the writer so the SETTINGS object never holds something garbage.
function setReductionDefault(key, raw) {
  if (key === 'defaultStrategy') {
    if (!['normal','applicative','cbn','cbv'].includes(raw)) return;
    SETTINGS.defaultStrategy = raw;
  } else if (key === 'defaultMaxSteps') {
    const s = (raw || '').trim();
    // Empty string is meaningful ("∞") — keep as empty string so the
    // pane's existing maxIn === '' || parseInt === 0 branch picks
    // Infinity. Anything else must parse to a positive integer.
    if (s === '') SETTINGS.defaultMaxSteps = '';
    else {
      const n = parseInt(s);
      if (!Number.isFinite(n) || n < 0) return;
      SETTINGS.defaultMaxSteps = String(n);
    }
  } else return;
  saveSettings();
}

function toggleSetting(key) {
  SETTINGS[key] = !SETTINGS[key];
  applySetting(key, SETTINGS[key]);
  syncSettingToggleUI();
  saveSettings();
}

function resetSettings() {
  SETTINGS = { ...SETTINGS_DEFAULTS };
  applyAllSettings();
  saveSettings();
}

// Apply one setting. Each case is intentionally explicit (rather than a
// table-driven approach) because the underlying behaviours differ —
// some need a re-render across all panes, some flip a body class, some
// drive an older global like COLOR_MODE that the rest of the pipeline
// already reads from.
function applySetting(key, on) {
  switch (key) {
    case 'color':
      COLOR_MODE = on;
      for (const p of getAllPanes()) if (p.currentAST) p._render(300 * SPEED_MULT, null);
      break;
    case 'anim':
      ANIM_ENABLED = on;
      break;
    case 'parens':
      EXPLICIT_PARENS = on;
      for (const p of getAllPanes()) if (p.currentAST) p._render(0, null);
      break;
    case 'sideBySide': {
      const host = document.getElementById('panesHost');
      if (host) host.classList.toggle('stack', on);
      break;
    }
    case 'hideSidebar':
      document.querySelector('.app')?.classList.toggle('no-sidebar', on);
      break;
    case 'disableAutocomplete':
      // Close any currently-open autocomplete list so flipping the
      // setting OFF doesn't leave a stale dropdown floating.
      if (on) {
        for (const p of getAllPanes()) p.acList?.classList.remove('open');
      }
      break;
    case 'sync':
      // Only flip SYNC_MODE if it actually changed — toggleSync() also
      // reveals the sync action buttons via the patched wrapper.
      if (SYNC_MODE !== on) toggleSync();
      break;
    case 'showRecord':
      document.querySelector('.app')?.classList.toggle('show-record', on);
      break;
    case 'godMode':
      document.querySelector('.app')?.classList.toggle('god-mode', on);
      break;
  }
}

// ── Global settings toggles ───────────────────────
function setScale(v) {
  SCALE = parseInt(v);
  // Two sliders may exist simultaneously — one pinned in the toolbar
  // (#sc) and one in the Settings modal (#setScale). Mirror the value
  // into whichever one didn't trigger the change so they stay in sync.
  // Setting .value doesn't fire input/change, so this can't loop.
  const sc = document.getElementById('sc');
  const setSc = document.getElementById('setScale');
  if (sc && sc.value != v) sc.value = v;
  if (setSc && setSc.value != v) setSc.value = v;
  const scv = document.getElementById('scv');
  const setScVal = document.getElementById('setScaleVal');
  if (scv) scv.textContent = v + 'px';
  if (setScVal) setScVal.textContent = v + 'px';
  for (const p of getAllPanes()) {
    if (p.currentAST) p._render(250, null);
  }
}
// Back-compat shims — the toolbar buttons that called these were moved
// into the Settings modal, but other code paths (URL handlers, tests,
// keyboard shortcuts) might still reach for the old names. Route them
// through toggleSetting() so the modal UI and persisted state stay in
// sync.
function toggleColor()  { toggleSetting('color'); }
function toggleAnim()   { toggleSetting('anim'); }
function toggleParens() { toggleSetting('parens'); }
function setSpeed(v) {
  const n = parseInt(v);
  const logSpeed = -1 + (n - 1) * (3 / 19);
  const mult = Math.pow(10, logSpeed);
  SPEED_MULT = 1 / mult;
  let label;
  if (mult < 1)       label = mult.toFixed(2) + 'x';
  else if (mult < 10) label = mult.toFixed(1) + 'x';
  else                label = Math.round(mult) + 'x';
  // Mirror to both possible sliders + labels (toolbar + modal).
  const sp = document.getElementById('speed');
  const setSp = document.getElementById('setSpeed');
  if (sp && sp.value != v) sp.value = v;
  if (setSp && setSp.value != v) setSp.value = v;
  const spv = document.getElementById('speedv');
  const setSpVal = document.getElementById('setSpeedVal');
  if (spv) spv.textContent = label;
  if (setSpVal) setSpVal.textContent = label;
}

// ── Pane management ───────────────────────────────
function addPane() {
  const host = document.getElementById('panesHost');
  const addBtn = document.getElementById('addPaneBtn');
  const pane = new Pane(host);
  // Move add-button to the end
  if (addBtn) host.appendChild(addBtn);
  pane.editor.focus();
  activePane = pane;
  pane.markFocused();
}
// Back-compat shim — the standalone "Stacked / Side-by-side" toolbar
// button is gone; the preference lives in the Settings modal now.
function togglePanesLayout() { toggleSetting('sideBySide'); }

// ── Sync mode ───────────────────────────────
// SYNC_MODE is the live flag the sync action buttons (Step/Run/Reset)
// gate on. The on/off control moved into Settings; toggleSync() just
// flips the flag — the index.html wrapper around it handles showing /
// hiding the action buttons in the toolbar.
let SYNC_MODE = false;
function toggleSync() { SYNC_MODE = !SYNC_MODE; }
function syncStep() {
  for (const p of getAllPanes()) p.step();
}
function syncRun() {
  for (const p of getAllPanes()) p.run();
}
function syncReset() {
  for (const p of getAllPanes()) p.reset();
}
function syncDraw() {
  for (const p of getAllPanes()) p.draw();
}

// ── Presentation mode ────────────────────────
let inPresentation = false;
let hudHidden = false;

// Tracks which pane is being shown in the current presentation
// session. Mirrored as `.presented` on the pane's root element, which
// the CSS uses to hide every other pane in body.presentation. Cleared
// on exit so a future Esc + re-enter picks the focused pane fresh.
let presentedPane = null;

function enterPresentation() {
  const panes = getAllPanes();
  // Pick which pane to present: prefer the user's focused one, fall
  // back to the first drawn pane. Multi-pane presentation is being
  // deferred — for now only one pane is shown at a time, and the
  // others are hidden via CSS.
  const focused = getActivePane();
  const target = (focused && focused.currentAST) ? focused
              : panes.find(p => p.currentAST)
              || null;
  if (!target) {
    showToast('Draw something first', 'warn');
    return;
  }
  inPresentation = true;
  hudHidden = false;
  presentedPane = target;
  document.body.classList.add('presentation');
  document.body.classList.remove('hud-hidden');
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('presented'));
  target.root.classList.add('presented');
  // Auto-fit only the presented pane.
  setTimeout(() => target.autoFit(), 80);
  // Seed the stats HUD with the pane's current state so it's not empty
  // until the first step / setStatus call.
  updatePresentationStats();
}
function exitPresentation() {
  if (!inPresentation) return;
  inPresentation = false;
  document.body.classList.remove('presentation', 'hud-hidden');
  document.querySelectorAll('.pane.presented').forEach(p => p.classList.remove('presented'));
  presentedPane = null;
  for (const p of getAllPanes()) p.resetView();
}

// Update the top-right step / time HUD shown during presentation.
// Called from Pane.setStatus when the active pane is the presented
// one, and on enter to seed the initial state.
function updatePresentationStats() {
  const stepEl = document.querySelector('.presentation-stats .ps-step');
  const timeEl = document.querySelector('.presentation-stats .ps-time');
  if (!stepEl || !timeEl) return;
  const p = presentedPane;
  if (!p) { stepEl.textContent = ''; timeEl.textContent = ''; return; }
  stepEl.textContent = 'step ' + p.stepCount.toLocaleString();
  timeEl.textContent = formatDuration(p.totalElapsed);
}
function toggleHudHidden() {
  hudHidden = !hudHidden;
  document.body.classList.toggle('hud-hidden', hudHidden);
}

// ── URL handling ────────────────────────────
function readURLExpression() {
  const params = new URLSearchParams(location.search);
  if (params.has('expr')) return params.get('expr');
  if (params.has('b64')) {
    try { return decodeURIComponent(escape(atob(params.get('b64')))); } catch { return null; }
  }
  return null;
}

// ── Init ────────────────────────────────────
function initVisualizer() {
  renderSidebar();
  setSpeed(document.getElementById('speed').value);

  // Create the first pane. If a URL expression is present, hydrate and
  // draw it; otherwise leave the pane empty so the placeholder text is
  // visible and the user knows where to start typing.
  addPane();
  const first = getAllPanes()[0];
  const urlExpr = readURLExpression();
  if (urlExpr) {
    first.editor.setValue(urlExpr);
    first.draw();
  }
  // ?konami=1 — site.js redirected here from the cheat code. Greet the
  // user with the same toast so they know the term they're staring at
  // (Ω = (\x. x x)(\x. x x)) is intentional, not a bug.
  if (new URLSearchParams(location.search).get('konami') === '1') {
    setTimeout(() => {
      if (typeof window.siteToast === 'function') {
        window.siteToast('you broke math — this term loops forever', 'Ω');
      }
    }, 600);
  }

  // Add-pane button
  document.getElementById('addPaneBtn').addEventListener('click', () => addPane());

  // Definition form
  document.getElementById('newExpr').addEventListener('keydown', e => { if (e.key === 'Enter') addUserDef(); });
  document.getElementById('newName').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('newExpr').focus(); });

  // Global keydown: Esc, Ctrl+F, presentation nav
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                  || (e.target && e.target.isContentEditable);

    // Esc → close fullscreen / find / presentation
    if (e.key === 'Escape') {
      if (inPresentation) { exitPresentation(); e.preventDefault(); return; }
      const fs = document.querySelector('.dw.fullscreen');
      if (fs) {
        fs.classList.remove('fullscreen');
        document.body.classList.remove('has-fullscreen-pane');
        for (const p of getAllPanes()) if (p.dwEl === fs) p.resetView();
        return;
      }
      const fb = document.querySelector('.find-bar.open');
      if (fb) { fb.classList.remove('open'); return; }
    }

    // Ctrl+F → find in active pane
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const pane = getActivePane() || getAllPanes()[0];
      if (pane) pane.toggleFind();
      return;
    }

    // Autocomplete navigation in any focused editor
    if (isInput && e.target.classList && e.target.classList.contains('editor')) {
      const pane = ALL_PANES.find(p => p.editor.el === e.target);
      if (pane) {
        const list = pane.acList;
        const isOpen = list.classList.contains('open');
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          if (isOpen && acSelected >= 0) {
            e.preventDefault();
            paneAcceptAutocomplete(pane, acOptions[acSelected]);
            return;
          }
          // Ctrl+Enter triggers draw (handled in editor) — bare Enter inserts newline (default)
        } else if (e.key === 'Tab' && isOpen) {
          e.preventDefault(); paneAcceptAutocomplete(pane, acOptions[acSelected]); return;
        } else if (e.key === 'ArrowDown' && isOpen) {
          e.preventDefault(); acSelected = (acSelected + 1) % acOptions.length; paneRenderAutocomplete(pane); return;
        } else if (e.key === 'ArrowUp' && isOpen) {
          e.preventDefault(); acSelected = (acSelected - 1 + acOptions.length) % acOptions.length; paneRenderAutocomplete(pane); return;
        } else if (e.key === 'Escape' && isOpen) {
          list.classList.remove('open'); return;
        }
      }
    }

    // Presentation keyboard shortcuts (only when not typing)
    if (inPresentation && !isInput) {
      const panes = getAllPanes();
      if (e.key === ' ' || e.key === 'ArrowRight') {
        for (const p of panes) if (!p.isRunning) p.step();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        for (const p of panes) if (!p.isRunning) p.stepBack();
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        for (const p of panes) if (!p.isRunning) p.run();
        e.preventDefault();
      } else if (e.key === 'p' || e.key === 'P') {
        for (const p of panes) if (p.isRunning) p.togglePause();
        e.preventDefault();
      } else if (e.key === '0') {
        for (const p of panes) p.reset();
        setTimeout(() => { for (const p of panes) p.autoFit(); }, 50);
        e.preventDefault();
      } else if (e.key === 'f' || e.key === 'F') {
        for (const p of panes) p.autoFit();
        e.preventDefault();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleHudHidden();
        e.preventDefault();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (inPresentation) setTimeout(() => { for (const p of getAllPanes()) p.autoFit(); }, 50);
  });
}
