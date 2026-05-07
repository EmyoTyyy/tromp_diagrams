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

// ── Global settings toggles ───────────────────────
function setScale(v) {
  SCALE = parseInt(v);
  document.getElementById('scv').textContent = v + 'px';
  // Re-render every pane (no animation)
  for (const p of getAllPanes()) {
    if (p.currentAST) p._render(250, null);
  }
}
function toggleColor() {
  COLOR_MODE = !COLOR_MODE;
  const btn = document.getElementById('colorBtn');
  btn.textContent = 'Color: ' + (COLOR_MODE ? 'ON' : 'OFF');
  btn.classList.toggle('active', COLOR_MODE);
  for (const p of getAllPanes()) if (p.currentAST) p._render(300 * SPEED_MULT, null);
}
function toggleAnim() {
  ANIM_ENABLED = !ANIM_ENABLED;
  const btn = document.getElementById('animBtn');
  btn.textContent = 'Anim: ' + (ANIM_ENABLED ? 'ON' : 'OFF');
  btn.classList.toggle('active', ANIM_ENABLED);
}
function toggleParens() {
  EXPLICIT_PARENS = !EXPLICIT_PARENS;
  const btn = document.getElementById('parensBtn');
  btn.textContent = 'Parens: ' + (EXPLICIT_PARENS ? 'ON' : 'OFF');
  btn.classList.toggle('active', EXPLICIT_PARENS);
  for (const p of getAllPanes()) if (p.currentAST) p._render(0, null);
}
function setSpeed(v) {
  const n = parseInt(v);
  const logSpeed = -1 + (n - 1) * (3 / 19);
  const mult = Math.pow(10, logSpeed);
  SPEED_MULT = 1 / mult;
  let label;
  if (mult < 1)       label = mult.toFixed(2) + 'x';
  else if (mult < 10) label = mult.toFixed(1) + 'x';
  else                label = Math.round(mult) + 'x';
  document.getElementById('speedv').textContent = label;
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
// Toggle between the default vertical stack (one pane per row, full
// width — diagrams get the most breathing room) and a side-by-side
// flex grid for direct comparison.
//
// CSS class semantics:
//   `.panes-host` (default)        → flex-direction: column → vertical
//   `.panes-host.stack`            → flex-direction: row, wrap → side-by-side
// The button label reflects the current visual mode, not the action.
function togglePanesLayout() {
  const host = document.getElementById('panesHost');
  const sideBySide = host.classList.toggle('stack');
  const btn = document.getElementById('layoutBtn');
  if (btn) {
    btn.textContent = sideBySide ? 'Side-by-side' : 'Stacked';
    btn.classList.toggle('active', sideBySide);
  }
}

// ── Sync mode ───────────────────────────────
let SYNC_MODE = false;
function toggleSync() {
  SYNC_MODE = !SYNC_MODE;
  const btn = document.getElementById('syncBtn');
  btn.classList.toggle('active', SYNC_MODE);
  btn.textContent = 'Sync: ' + (SYNC_MODE ? 'ON' : 'OFF');
}
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

function enterPresentation() {
  const panes = getAllPanes();
  if (!panes.length || !panes[0].currentAST) {
    showToast('Draw something first', 'warn');
    return;
  }
  inPresentation = true;
  hudHidden = false;
  document.body.classList.add('presentation');
  document.body.classList.remove('hud-hidden');
  // Auto-fit each pane
  setTimeout(() => { for (const p of panes) p.autoFit(); }, 80);
}
function exitPresentation() {
  if (!inPresentation) return;
  inPresentation = false;
  document.body.classList.remove('presentation', 'hud-hidden');
  for (const p of getAllPanes()) p.resetView();
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
