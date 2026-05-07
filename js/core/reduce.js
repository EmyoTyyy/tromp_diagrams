// ═══════════════════════════════════════
// SUBSTITUTION + β-REDUCTION STRATEGIES
// ═══════════════════════════════════════
function freeVars(n) {
  if (n.t === 'var') return new Set([n.v]);
  if (n.t === 'lam') { const s = freeVars(n.b); s.delete(n.v); return s; }
  const s = new Set(freeVars(n.f));
  for (const v of freeVars(n.a)) s.add(v);
  return s;
}

function fresh(name, avoid) {
  const base = name.replace(/'+$/, '');
  let i = 0, cand = name;
  while (avoid.has(cand)) { i++; cand = base + "'".repeat(i); }
  return cand;
}

function subst(M, x, N) {
  if (M.t === 'var') {
    return M.v === x ? cloneFresh(N) : { t: 'var', v: M.v, id: M.id };
  }
  if (M.t === 'lam') {
    if (M.v === x) return cloneKeep(M);
    const fvN = freeVars(N);
    let y = M.v, body = M.b;
    if (fvN.has(y)) {
      const avoid = new Set([...fvN, ...freeVars(body), x]);
      const newY = fresh(y, avoid);
      body = subst(body, y, mkVar(newY));
      y = newY;
    }
    return { t: 'lam', v: y, b: subst(body, x, N), id: M.id };
  }
  return { t: 'app', f: subst(M.f, x, N), a: subst(M.a, x, N), id: M.id };
}

// Each reducer also returns `reducedId` — the id of the application node
// where β-reduction happens. Used by the UI to flash that redex before the
// new AST is rendered.
function reduceNormal(n) {
  if (n.t === 'app') {
    if (n.f.t === 'lam') return { node: subst(n.f.b, n.f.v, n.a), reduced: true, reducedId: n.id };
    const L = reduceNormal(n.f);
    if (L.reduced) return { node: { t: 'app', f: L.node, a: n.a, id: n.id }, reduced: true, reducedId: L.reducedId };
    const R = reduceNormal(n.a);
    if (R.reduced) return { node: { t: 'app', f: n.f, a: R.node, id: n.id }, reduced: true, reducedId: R.reducedId };
  }
  if (n.t === 'lam') {
    const b = reduceNormal(n.b);
    if (b.reduced) return { node: { t: 'lam', v: n.v, b: b.node, id: n.id }, reduced: true, reducedId: b.reducedId };
  }
  return { node: n, reduced: false };
}

function reduceApplicative(n) {
  if (n.t === 'app') {
    const L = reduceApplicative(n.f);
    if (L.reduced) return { node: { t: 'app', f: L.node, a: n.a, id: n.id }, reduced: true, reducedId: L.reducedId };
    const R = reduceApplicative(n.a);
    if (R.reduced) return { node: { t: 'app', f: n.f, a: R.node, id: n.id }, reduced: true, reducedId: R.reducedId };
    if (n.f.t === 'lam') return { node: subst(n.f.b, n.f.v, n.a), reduced: true, reducedId: n.id };
  }
  if (n.t === 'lam') {
    const b = reduceApplicative(n.b);
    if (b.reduced) return { node: { t: 'lam', v: n.v, b: b.node, id: n.id }, reduced: true, reducedId: b.reducedId };
  }
  return { node: n, reduced: false };
}

function reduceCBN(n) {
  if (n.t === 'app') {
    if (n.f.t === 'lam') return { node: subst(n.f.b, n.f.v, n.a), reduced: true, reducedId: n.id };
    const L = reduceCBN(n.f);
    if (L.reduced) return { node: { t: 'app', f: L.node, a: n.a, id: n.id }, reduced: true, reducedId: L.reducedId };
  }
  return { node: n, reduced: false };
}

function reduceCBV(n) {
  if (n.t === 'app') {
    const L = reduceCBV(n.f);
    if (L.reduced) return { node: { t: 'app', f: L.node, a: n.a, id: n.id }, reduced: true, reducedId: L.reducedId };
    const R = reduceCBV(n.a);
    if (R.reduced) return { node: { t: 'app', f: n.f, a: R.node, id: n.id }, reduced: true, reducedId: R.reducedId };
    if (n.f.t === 'lam') return { node: subst(n.f.b, n.f.v, n.a), reduced: true, reducedId: n.id };
  }
  return { node: n, reduced: false };
}

const STRATEGIES = {
  normal:      reduceNormal,
  applicative: reduceApplicative,
  cbn:         reduceCBN,
  cbv:         reduceCBV,
};

function doStep(ast, strat) {
  substOriginMap = {};
  const result = strat(ast);
  const originMap = substOriginMap;
  substOriginMap = null;
  return { ...result, originMap };
}

// Reduce at a specific app node id (for click-to-reduce).
function reduceAt(ast, targetId) {
  function walk(n) {
    if (n.id === targetId && n.t === 'app' && n.f.t === 'lam') {
      return { node: subst(n.f.b, n.f.v, n.a), reduced: true, reducedId: n.id };
    }
    if (n.t === 'app') {
      const L = walk(n.f);
      if (L.reduced) return { node: { t: 'app', f: L.node, a: n.a, id: n.id }, reduced: true, reducedId: L.reducedId };
      const R = walk(n.a);
      if (R.reduced) return { node: { t: 'app', f: n.f, a: R.node, id: n.id }, reduced: true, reducedId: R.reducedId };
    }
    if (n.t === 'lam') {
      const b = walk(n.b);
      if (b.reduced) return { node: { t: 'lam', v: n.v, b: b.node, id: n.id }, reduced: true, reducedId: b.reducedId };
    }
    return { node: n, reduced: false };
  }
  substOriginMap = {};
  const result = walk(ast);
  const originMap = substOriginMap;
  substOriginMap = null;
  return { ...result, originMap };
}
