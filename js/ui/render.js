// ═══════════════════════════════════════
// SVG RENDER + RAF ANIMATIONS + CODE PRETTY-PRINT
// ═══════════════════════════════════════
const SVG_NS = 'http://www.w3.org/2000/svg';

let SCALE = 8;
let COLOR_MODE = false;
let ANIM_ENABLED = true;
let SPEED_MULT = 1.0;
let EXPLICIT_PARENS = false;

// easeOutCubic: starts fast, decelerates into the destination. Reads as
// "snappier" than the symmetric quartic in-out it replaces — no slow build-up
// at the start, but a soft landing at the end.
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateLine(line, from, to, duration, onDone) {
  if (line._anim) { cancelAnimationFrame(line._anim); line._anim = null; }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const k = easeOutCubic(t);
    line.setAttribute('x1', from.x1 + (to.x1 - from.x1) * k);
    line.setAttribute('y1', from.y1 + (to.y1 - from.y1) * k);
    line.setAttribute('x2', from.x2 + (to.x2 - from.x2) * k);
    line.setAttribute('y2', from.y2 + (to.y2 - from.y2) * k);
    if (from.opacity !== undefined && to.opacity !== undefined) {
      line.style.opacity = from.opacity + (to.opacity - from.opacity) * k;
    }
    if (t < 1) line._anim = requestAnimationFrame(frame);
    else { line._anim = null; if (onDone) onDone(); }
  }
  line._anim = requestAnimationFrame(frame);
}

function setLineAttrs(line, x1, y1, x2, y2, stroke, sw) {
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('stroke', stroke);
  line.setAttribute('stroke-width', sw);
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── PRETTY-PRINT ─────────────────────────────────
// `EXPLICIT_PARENS` → wrap everything that could be ambiguous.
// We add data attributes (data-vid, data-binder) so we can highlight occurrences.
//
// Note: `let x = v in body` is a parse-time macro — the parser substitutes
// `v` into `body` directly, so by the time the pretty-printer runs there's
// no `(\x. body) v` redex to recognise. What you see here is the plain
// lambda code that results from the substitution.
function renderCode(node, needParens, colorOn, ctx = {}) {
  const wrap = (col, txt, attrs = '') => {
    if (colorOn) return `<span style="color:${col}"${attrs}>${txt}</span>`;
    return attrs ? `<span${attrs}>${txt}</span>` : txt;
  };
  if (node.t === 'var') {
    const binderId = ctx.scope && ctx.scope[node.v];
    const attrs = binderId
      ? ` class="var-occ" data-binder="${binderId}" data-name="${escapeHTML(node.v)}"`
      : ` class="var-occ var-free" data-name="${escapeHTML(node.v)}"`;
    return wrap(node.color, escapeHTML(node.v), attrs);
  }
  if (node.t === 'lam') {
    const newScope = { ...(ctx.scope || {}), [node.v]: node.id };
    const subCtx = { ...ctx, scope: newScope };
    const body = renderCode(node.b, false, colorOn, subCtx);
    const head = wrap(node.color, 'λ' + escapeHTML(node.v) + '.',
      ` class="binder" data-binder-id="${node.id}" data-name="${escapeHTML(node.v)}"`);
    const s = head + ' ' + body;
    return needParens ? '(' + s + ')' : s;
  }
  // app
  let fn, arg;
  if (EXPLICIT_PARENS) {
    fn  = renderCode(node.f, node.f.t !== 'var', colorOn, ctx);
    arg = renderCode(node.a, node.a.t !== 'var', colorOn, ctx);
  } else {
    fn  = renderCode(node.f, node.f.t === 'lam', colorOn, ctx);
    arg = renderCode(node.a, node.a.t !== 'var', colorOn, ctx);
  }
  const s = fn + ' ' + arg;
  return needParens ? '(' + s + ')' : s;
}

function renderCodePlain(node, needParens) {
  if (node.t === 'var') return node.v;
  if (node.t === 'lam') {
    const s = 'λ' + node.v + '. ' + renderCodePlain(node.b, false);
    return needParens ? '(' + s + ')' : s;
  }
  let fn, arg;
  if (EXPLICIT_PARENS) {
    fn  = renderCodePlain(node.f, node.f.t !== 'var');
    arg = renderCodePlain(node.a, node.a.t !== 'var');
  } else {
    fn  = renderCodePlain(node.f, node.f.t === 'lam');
    arg = renderCodePlain(node.a, node.a.t !== 'var');
  }
  const s = fn + ' ' + arg;
  return needParens ? '(' + s + ')' : s;
}

// ── DIAGRAM RENDERING ─────────────────────────────
function renderDiagram(currentAST, duration, originMap, opts = {}) {
  if (!currentAST) return;
  if (!ANIM_ENABLED) duration = 0;
  if (duration > 0 && duration < 30) duration = 0;

  const PAD = 3;
  const { segs, redexes, gridW, gridH } = computeDiagram(currentAST);
  const W = (gridW + PAD * 2) * SCALE;
  const H = (gridH + PAD * 2) * SCALE;
  const ox = PAD * SCALE, oy = PAD * SCALE;
  const sw = Math.max(2, Math.round(SCALE * 0.55));

  const svgId  = opts.svgId  || 'diagramSVG';
  const segsId = opts.segsId || 'segs';
  const zonesId = opts.zonesId || 'redexZones';

  const svg = document.getElementById(svgId);
  const group = document.getElementById(segsId);
  const redexGroup = document.getElementById(zonesId);
  if (!svg || !group) return;

  svg.style.setProperty('--dur', duration + 'ms');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  const existing = {};
  const oldPositions = {};
  for (const line of Array.from(group.children)) {
    const sid = line.getAttribute('data-segid');
    if (!sid) continue;
    existing[sid] = line;
    oldPositions[sid] = {
      x1: parseFloat(line.getAttribute('x1')) || 0,
      y1: parseFloat(line.getAttribute('y1')) || 0,
      x2: parseFloat(line.getAttribute('x2')) || 0,
      y2: parseFloat(line.getAttribute('y2')) || 0,
      stroke: line.getAttribute('stroke'),
      opacity: parseFloat(line.style.opacity || '1'),
    };
  }

  const instant = duration === 0;
  // Origin lines that have already been "claimed" by a copy in this render —
  // they slide instead of fading out, so don't fade them at the end.
  const claimedOrigins = new Set();

  // Helper to apply attrs that don't change during animation.
  const applyStaticAttrs = (line, s, color) => {
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', sw);
    line.setAttribute('stroke-linecap', s.kind === 'V' ? 'butt' : 'square');
    if (s.varName) line.setAttribute('data-varname', s.varName);
    else line.removeAttribute('data-varname');
  };

  for (const s of segs) {
    const color = COLOR_MODE ? s.color : '#ffffff';
    const nx1 = ox + s.x1 * SCALE, ny1 = oy + s.y1 * SCALE;
    const nx2 = ox + s.x2 * SCALE, ny2 = oy + s.y2 * SCALE;

    // ── Case 1: same node id continues across the step. Just slide it. ──
    let line = existing[s.segid];
    if (line) {
      applyStaticAttrs(line, s, color);
      const from = oldPositions[s.segid];
      const to = { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
      if (instant) { setLineAttrs(line, nx1, ny1, nx2, ny2, color, sw); line.style.opacity = '1'; }
      else animateLine(line, { ...from, opacity: from.opacity }, { ...to, opacity: 1 }, duration);
      delete existing[s.segid];
      continue;
    }

    // ── Case 2: this is a substitution copy. If the origin line still
    // exists and hasn't been claimed yet, REUSE it: it physically slides
    // from its old spot to this copy's destination. No fade-out, no
    // double-and-disappear. ──
    const originId = originMap && originMap[s.nodeId];
    const originSegId = originId ? (s.kind + originId) : null;
    if (originSegId && existing[originSegId] && !claimedOrigins.has(originSegId)) {
      line = existing[originSegId];
      claimedOrigins.add(originSegId);
      delete existing[originSegId];
      line.setAttribute('data-segid', s.segid);
      applyStaticAttrs(line, s, color);
      const from = oldPositions[originSegId];
      const to = { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
      if (instant) { setLineAttrs(line, nx1, ny1, nx2, ny2, color, sw); line.style.opacity = '1'; }
      else animateLine(line, { ...from, opacity: from.opacity }, { ...to, opacity: 1 }, duration);
      continue;
    }

    // ── Case 3: brand-new line. If a sibling copy already claimed the
    // origin, slide from the same starting spot (looks like a clean split).
    // Otherwise fade in at the final position. ──
    line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('data-segid', s.segid);
    applyStaticAttrs(line, s, color);
    group.appendChild(line);

    if (instant) {
      setLineAttrs(line, nx1, ny1, nx2, ny2, color, sw);
      line.style.opacity = '1';
      continue;
    }

    const originPos = originSegId ? oldPositions[originSegId] : null;
    if (originPos) {
      setLineAttrs(line, originPos.x1, originPos.y1, originPos.x2, originPos.y2, color, sw);
      line.style.opacity = '1';
      animateLine(line,
        { x1: originPos.x1, y1: originPos.y1, x2: originPos.x2, y2: originPos.y2, opacity: 1 },
        { x1: nx1, y1: ny1, x2: nx2, y2: ny2, opacity: 1 }, duration);
    } else {
      setLineAttrs(line, nx1, ny1, nx2, ny2, color, sw);
      line.style.opacity = '0';
      animateLine(line,
        { x1: nx1, y1: ny1, x2: nx2, y2: ny2, opacity: 0 },
        { x1: nx1, y1: ny1, x2: nx2, y2: ny2, opacity: 1 }, duration);
    }
  }

  // Lines genuinely going away (no continuation, no claim): fade out in place.
  // Slightly faster than the position animation so they "let go" before the
  // arriving lines settle. Each line gets a tiny random start delay so the
  // departure looks organic rather than a single synchronized blink.
  const fadeDur = Math.max(60, duration * 0.85);
  const maxStagger = Math.min(80, duration * 0.08);
  for (const segid in existing) {
    const line = existing[segid];
    const from = oldPositions[segid];
    if (instant) { if (line.parentNode) line.parentNode.removeChild(line); continue; }
    const delay = Math.random() * maxStagger;
    const fadeFrom = { x1: from.x1, y1: from.y1, x2: from.x2, y2: from.y2, opacity: from.opacity };
    const fadeTo   = { x1: from.x1, y1: from.y1, x2: from.x2, y2: from.y2, opacity: 0 };
    const cleanup  = () => { if (line.parentNode) line.parentNode.removeChild(line); };
    if (delay < 1) animateLine(line, fadeFrom, fadeTo, fadeDur, cleanup);
    else setTimeout(() => animateLine(line, fadeFrom, fadeTo, fadeDur, cleanup), delay);
  }

  // Redex hover zones
  if (redexGroup) {
    while (redexGroup.firstChild) redexGroup.removeChild(redexGroup.firstChild);
    if (opts.skipRedexZones) return;
    for (const r of redexes) {
      const zx1 = ox + r.x1 * SCALE - 2;
      const zy1 = oy + r.y1 * SCALE - 2;
      const zw = (r.x2 - r.x1) * SCALE + 4;
      const zh = (r.y2 - r.y1) * SCALE + 4;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'redex-zone');
      // The fill is also set in CSS (.dw svg .redex-zone { fill: transparent }),
      // but PNG export serialises the SVG and rasterises it standalone — page
      // CSS doesn't apply, and the SVG default rect fill is BLACK.  Setting
      // the attribute here makes the rect transparent both live and on export.
      rect.setAttribute('fill', 'transparent');
      rect.setAttribute('x', zx1);
      rect.setAttribute('y', zy1);
      rect.setAttribute('width', zw);
      rect.setAttribute('height', zh);
      rect.dataset.appId = r.appNodeId;
      rect.dataset.segIds = r.segIds.join(',');
      rect.addEventListener('mouseenter', highlightRedex);
      rect.addEventListener('mouseleave', unhighlightRedex);
      rect.addEventListener('click', opts.onRedexClick || (() => {}));
      redexGroup.appendChild(rect);
    }
  }
}

function highlightRedex(e) {
  const ids = e.currentTarget.dataset.segIds.split(',');
  for (const sid of ids) {
    const line = document.querySelector(`#segs line[data-segid="${sid}"]`);
    if (line) line.classList.add('highlighted');
  }
}

function unhighlightRedex(e) {
  const ids = e.currentTarget.dataset.segIds.split(',');
  for (const sid of ids) {
    const line = document.querySelector(`#segs line[data-segid="${sid}"]`);
    if (line) line.classList.remove('highlighted');
  }
}
