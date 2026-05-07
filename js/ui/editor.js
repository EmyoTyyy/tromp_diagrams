// ═══════════════════════════════════════
// FOLDABLE EDITOR — contenteditable with λ-body folding
//
// Each FoldableEditor wraps a contenteditable <div>. Public API:
//   .getValue()         → plain text source (with all folds expanded)
//   .setValue(s)        → replace contents; keeps folds collapsed by default
//   .focus()            → focus the editor
//   .onInput(cb)        → register input listener
//   .insertAtCursor(s)  → insert text at the caret
//   .renderFolds()      → re-scan and add fold markers for long λ-bodies
//
// A "long" λ-body is one whose source length exceeds FOLD_THRESHOLD characters.
// Folds preserve a canonical text via data attributes on the wrapper span:
//   <span class="fold collapsed" data-body="...">
//     <span class="fold-toggle">▶</span><span class="fold-placeholder">{…}</span><span class="fold-body">...</span>
//   </span>
// ═══════════════════════════════════════

const FOLD_THRESHOLD = 60;   // body must be at least this many chars to be foldable

class FoldableEditor {
  constructor(container, opts = {}) {
    this.container = container;
    this.placeholder = opts.placeholder || '';
    this.onInputCb = null;
    this.onChangeCb = null;
    this.onEnterCb = null;

    this.el = document.createElement('div');
    this.el.className = 'editor';
    this.el.contentEditable = 'true';
    this.el.setAttribute('spellcheck', 'false');
    if (this.placeholder) this.el.setAttribute('placeholder', this.placeholder);
    container.appendChild(this.el);

    this.el.addEventListener('input', () => {
      // contenteditable usually leaves a stray <br> or <div> after the
      // user deletes everything, which keeps the element non-:empty and
      // suppresses the placeholder. Normalize: when the visible text is
      // gone, clear the DOM so :empty matches and the CSS placeholder
      // pseudo-element re-appears.
      if (this.el.textContent === '' && this.el.children.length > 0) {
        this.el.innerHTML = '';
      }
      if (this.onInputCb) this.onInputCb();
    });
    this.el.addEventListener('keydown', (e) => {
      // Allow Enter to make a newline (default in contenteditable)
      // Ctrl/Cmd+Enter triggers the onEnter callback
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (this.onEnterCb) this.onEnterCb();
      }
      // Click on fold-toggle handled separately
    });
    // Click handler for fold toggles (delegate)
    this.el.addEventListener('click', (e) => {
      const toggle = e.target.closest('.fold-toggle');
      if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        const fold = toggle.closest('.fold');
        if (fold) toggleFold(fold);
        return;
      }
    });
    // Paste as plain text (avoid HTML pollution)
    this.el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      this.insertAtCursor(text);
      if (this.onInputCb) this.onInputCb();
    });
  }

  onInput(cb)    { this.onInputCb = cb; }
  onChange(cb)   { this.onChangeCb = cb; }
  onEnter(cb)    { this.onEnterCb = cb; }
  focus()        { this.el.focus(); }

  // Get plain-text source (expanding folded bodies)
  getValue() {
    return extractText(this.el);
  }

  setValue(s) {
    this.el.textContent = s;
  }

  insertAtCursor(s) {
    // Keep simple: just append text at the cursor position via execCommand for compatibility
    // Or use Selection/Range API directly
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      this.el.textContent += s;
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(s);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Re-scan source and add fold widgets to long λ-bodies.
  // Preserves caret position (best effort).
  renderFolds() {
    const text = this.getValue();
    const folds = findFoldableSpans(text);
    if (folds.length === 0) {
      // No folds — just keep plain text
      const sel = saveSelection(this.el);
      this.el.textContent = text;
      restoreSelection(this.el, sel);
      return;
    }
    // Build new HTML with fold spans
    const html = buildFoldedHTML(text, folds);
    const sel = saveSelection(this.el);
    this.el.innerHTML = html;
    restoreSelection(this.el, sel);
  }

  // Collapse / expand all folds
  collapseAll() {
    this.el.querySelectorAll('.fold').forEach(f => f.classList.add('collapsed'));
    this.el.querySelectorAll('.fold-toggle').forEach(t => t.textContent = '▶');
  }
  expandAll() {
    this.el.querySelectorAll('.fold').forEach(f => f.classList.remove('collapsed'));
    this.el.querySelectorAll('.fold-toggle').forEach(t => t.textContent = '▼');
  }

  // Returns the textarea-like value, used by autocomplete (single-line behaviour)
  get value() { return this.getValue(); }
  set value(v) { this.setValue(v); }

  get selectionStart() {
    return getCaretOffset(this.el);
  }
  setSelectionRange(start /*, end*/) {
    setCaretOffset(this.el, start);
  }
}

// ── Helpers ────────────────────────────────────────────

// Extract textContent recursively but expand folds (use data-body for collapsed nodes)
function extractText(root) {
  let out = '';
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
      return;
    }
    if (node.classList && node.classList.contains('fold-placeholder')) return;
    if (node.classList && node.classList.contains('fold-toggle')) return;
    if (node.classList && node.classList.contains('fold')) {
      // Always read from .fold-body so edits during expand/collapse are preserved.
      // Fall back to data-body if no fold-body child exists (defensive).
      let bodyEl = null;
      for (const c of node.children) if (c.classList.contains('fold-body')) bodyEl = c;
      if (bodyEl) walk(bodyEl);
      else out += node.getAttribute('data-body') || '';
      return;
    }
    if (node.tagName === 'BR') { out += '\n'; return; }
    if (node.tagName === 'DIV' && out && !out.endsWith('\n')) out += '\n';
    for (const c of node.childNodes) walk(c);
  }
  walk(root);
  return out.replace(/ /g, ' '); // nbsp → space
}

// Find positions in `src` where a λ-body is "long" enough to be foldable.
// Returns [{ headStart, bodyStart, bodyEnd }, ...] for each foldable.
// We scan: λ <name>+ . <body> where body is the rest until matching ) or EOF.
function findFoldableSpans(src) {
  const result = [];
  let i = 0;
  // Tokenize-like scanning
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' || c === 'λ') {
      const headStart = i;
      let j = i + 1;
      // skip vars
      while (j < src.length && (/\s/.test(src[j]) || /[a-zA-Z0-9_']/.test(src[j]))) j++;
      if (src[j] !== '.') { i++; continue; }
      const bodyStart = j + 1;
      // body ends at matching ) at depth 0, or end of input, or the matching enclosing paren close
      let depth = 0;
      let k = bodyStart;
      while (k < src.length) {
        const ch = src[k];
        if (ch === '(') depth++;
        else if (ch === ')') {
          if (depth === 0) break;
          depth--;
        }
        k++;
      }
      const bodyEnd = k;
      const body = src.slice(bodyStart, bodyEnd);
      if (body.trim().length > FOLD_THRESHOLD) {
        result.push({ headStart, bodyStart, bodyEnd });
      }
      i = bodyStart;
    } else {
      i++;
    }
  }
  // Filter out nested folds (only outermost)
  const filtered = [];
  for (const f of result) {
    if (filtered.some(x => f.headStart >= x.bodyStart && f.bodyEnd <= x.bodyEnd)) continue;
    filtered.push(f);
  }
  return filtered;
}

// Build HTML where foldable bodies are wrapped.
function buildFoldedHTML(src, folds) {
  let out = '';
  let last = 0;
  for (const f of folds) {
    // Up to head
    out += escapeHTML(src.slice(last, f.bodyStart));
    const body = src.slice(f.bodyStart, f.bodyEnd);
    const safeBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    out += `<span class="fold" data-body="${safeBody}">`
        +  `<span class="fold-toggle" contenteditable="false">▼</span>`
        +  `<span class="fold-placeholder" contenteditable="false">{…}</span>`
        +  `<span class="fold-body">${escapeHTML(body)}</span>`
        +  `</span>`;
    last = f.bodyEnd;
  }
  out += escapeHTML(src.slice(last));
  return out;
}

function toggleFold(foldEl) {
  const collapsed = foldEl.classList.toggle('collapsed');
  const toggle = foldEl.querySelector('.fold-toggle');
  if (toggle) toggle.textContent = collapsed ? '▶' : '▼';
}

// ── Caret save/restore (best-effort) ───────────────────
function getCaretOffset(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}
function setCaretOffset(root, offset) {
  const range = document.createRange();
  let remaining = offset;
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        return true;
      }
      remaining -= len;
      return false;
    }
    for (const c of node.childNodes) if (walk(c)) return true;
    return false;
  }
  if (walk(root)) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
function saveSelection(root) { return getCaretOffset(root); }
function restoreSelection(root, off) { setCaretOffset(root, off); }
