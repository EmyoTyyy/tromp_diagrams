// ═══════════════════════════════════════
// CHURCH NUMERALS + DEFINITION ELABORATION
// ═══════════════════════════════════════
function churchNumeral(n) {
  let body = mkVar('x');
  for (let i = 0; i < n; i++) body = mkApp(mkVar('f'), body);
  return mkLam('f', mkLam('x', body));
}

// Expand defined names and numeric literals. Respects lambda scope.
function elaborate(node, defs, boundVars = new Set(), visitedDefs = new Set()) {
  if (node.t === 'var') {
    if (boundVars.has(node.v)) return mkVar(node.v);
    if (/^\d+$/.test(node.v)) return churchNumeral(parseInt(node.v, 10));
    if (defs[node.v] !== undefined) {
      if (visitedDefs.has(node.v)) return mkVar(node.v);
      let sub;
      try { sub = parse(defs[node.v]); }
      catch { return mkVar(node.v); }
      return elaborate(sub, defs, new Set(), new Set([...visitedDefs, node.v]));
    }
    return mkVar(node.v);
  }
  if (node.t === 'lam') {
    const nb = new Set(boundVars); nb.add(node.v);
    return mkLam(node.v, elaborate(node.b, defs, nb, visitedDefs));
  }
  return mkApp(
    elaborate(node.f, defs, boundVars, visitedDefs),
    elaborate(node.a, defs, boundVars, visitedDefs)
  );
}
