// ═══════════════════════════════════════
// DIAGRAM LAYOUT
//   Two-pass layout: sizePass assigns columns,
//   then computeY places lambda/app bars vertically.
// ═══════════════════════════════════════

const PALETTE = [
  '#60c8f0', '#f0c060', '#c070f0', '#60f0a0', '#f08070',
  '#a0b0f0', '#f0a0d0', '#60f0d0', '#f0f070', '#b0f070',
];

function colorForName(name) {
  // Strip trailing primes so capture-avoiding alpha-renames (x → x' → x'')
  // keep the same color across reductions.
  const base = name.replace(/'+$/, '') || name;
  let h = 0;
  for (const c of base) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function assignColors(node, env) {
  if (node.t === 'var') {
    node.color = env[node.v] || colorForName(node.v);
    return;
  }
  if (node.t === 'lam') {
    node.color = colorForName(node.v);
    assignColors(node.b, { ...env, [node.v]: node.color });
    return;
  }
  assignColors(node.f, env);
  assignColors(node.a, env);
  node.color = leftmostColor(node.f);
}

function leftmostColor(n) {
  if (n.t === 'var') return n.color;
  if (n.t === 'lam') return leftmostColor(n.b);
  return leftmostColor(n.f);
}

let gCol = 0;

function sizePass(n) {
  if (n.t === 'var') { n.col = gCol++; n.nv = 1; return; }
  if (n.t === 'lam') { sizePass(n.b); n.col = n.b.col; n.nv = n.b.nv; return; }
  sizePass(n.f); sizePass(n.a);
  n.col = n.f.col; n.nv = n.f.nv + n.a.nv;
}

function leftmostCol(n) {
  if (n.t === 'var') return n.col;
  if (n.t === 'lam') return leftmostCol(n.b);
  return leftmostCol(n.f);
}

function computeY(n, ly, scope) {
  if (n.t === 'lam') {
    n.barY = ly;
    const bodyDeepest = computeY(n.b, ly + 2, { ...scope, [n.v]: ly });
    // Each lam occupies 2 y-units (its bar + its body slot). Returning
    // just the body's reported depth crushes a chain of lams under the
    // parent's app bar when the body is a variable bound near the top
    // of the chain — the parent doesn't see how tall the chain is.
    return Math.max(bodyDeepest, ly + 2);
  }
  if (n.t === 'var') {
    n.endpointY = scope[n.v] !== undefined ? scope[n.v] : 0;
    return n.endpointY;
  }
  const L = computeY(n.f, ly, scope);
  const R = computeY(n.a, ly, scope);
  n.barY = Math.max(L, R) + 2;
  return n.barY;
}

function collectSegments(root, totalH) {
  const segs = [];
  const varWireEnd = {};
  const varOccs = [];
  const redexes = [];

  function segIdsIn(node, acc) {
    if (node.t === 'lam') { acc.push('L' + node.id); segIdsIn(node.b, acc); }
    else if (node.t === 'app') { acc.push('A' + node.id); segIdsIn(node.f, acc); segIdsIn(node.a, acc); }
    else acc.push('V' + node.id);
    return acc;
  }

  function walk(n) {
    if (n.t === 'lam') {
      // λ-binder bars extend 1 grid unit past the leftmost/rightmost wires on
      // each side — canonical Tromp look. Application bars (below) DON'T get
      // this overhang: they're connectors between two subterms and stop
      // exactly at the wires they connect, which is what reads visually as
      // "this is applied to this". Wires use 'butt' linecap in the renderer
      // so they never poke past the bar above them.
      const x1 = n.col * 4;                  // = leftWireX - 1
      const x2 = n.col * 4 + n.nv * 4 - 2;   // = rightWireX + 1
      segs.push({ segid: 'L' + n.id, nodeId: n.id, kind: 'L', x1, y1: n.barY, x2, y2: n.barY, color: n.color });
      walk(n.b);
    } else if (n.t === 'app') {
      const lCol = leftmostCol(n.f);
      const rCol = leftmostCol(n.a);
      // App bars span exactly between the two connection wires; square
      // linecap in the renderer adds sw/2 to each end, aligning the bar's
      // outer edge with the wires' outer edges (no extra overhang).
      const lx = lCol * 4 + 1;
      const rx = rCol * 4 + 1;
      segs.push({ segid: 'A' + n.id, nodeId: n.id, kind: 'A', x1: lx, y1: n.barY, x2: rx, y2: n.barY, color: n.color });
      varWireEnd[lCol] = Math.max(varWireEnd[lCol] || 0, n.barY);
      varWireEnd[rCol] = Math.max(varWireEnd[rCol] || 0, n.barY);

      if (n.f.t === 'lam') {
        const ids = ['A' + n.id];
        segIdsIn(n.f, ids);
        segIdsIn(n.a, ids);
        redexes.push({
          appNodeId: n.id,
          segIds: ids,
          x1: n.col * 4,
          x2: n.col * 4 + n.nv * 4 - 2,
          y1: n.f.barY,
          y2: n.barY,
        });
      }
      walk(n.f); walk(n.a);
    } else {
      varOccs.push(n);
    }
  }

  walk(root);
  const rootLeftCol = leftmostCol(root);
  for (const v of varOccs) {
    const x = v.col * 4 + 1;
    const y1 = v.endpointY;
    let y2 = varWireEnd[v.col] !== undefined ? varWireEnd[v.col] : y1;
    if (v.col === rootLeftCol) y2 = totalH;
    if (y2 > y1) {
      segs.push({ segid: 'V' + v.id, nodeId: v.id, kind: 'V', x1: x, y1, x2: x, y2, color: v.color, varName: v.v });
    }
  }
  return { segs, redexes };
}

function computeDiagram(ast) {
  const work = cloneKeep(ast);
  assignColors(work, {});
  gCol = 0;
  sizePass(work);
  computeY(work, 0, {});
  function maxY(n) {
    if (n.t === 'lam') return Math.max(n.barY, maxY(n.b));
    if (n.t === 'app') return Math.max(n.barY, maxY(n.f), maxY(n.a));
    return n.endpointY;
  }
  const totalH = maxY(work) + 2;
  const { segs, redexes } = collectSegments(work, totalH);
  const gridW = work.nv * 4 - 1;
  return { segs, redexes, gridW, gridH: totalH };
}
