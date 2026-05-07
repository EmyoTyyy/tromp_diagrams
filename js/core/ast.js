// ═══════════════════════════════════════
// AST NODE CONSTRUCTORS + ID MANAGEMENT
// ═══════════════════════════════════════
let idCounter = 0;
function nextId() { return ++idCounter; }

function mkVar(v)   { return { t: 'var', v, id: nextId() }; }
function mkLam(v, b) { return { t: 'lam', v, b, id: nextId() }; }
function mkApp(f, a) { return { t: 'app', f, a, id: nextId() }; }

// Used during substitution to record which old id each new id originates from.
// renderDiagram uses this to make new lines "fly out" of their source positions.
let substOriginMap = null;

function cloneFresh(n) {
  if (n.t === 'var') {
    const newId = nextId();
    if (substOriginMap) substOriginMap[newId] = n.id;
    return { t: 'var', v: n.v, id: newId };
  }
  if (n.t === 'lam') {
    const newId = nextId();
    if (substOriginMap) substOriginMap[newId] = n.id;
    return { t: 'lam', v: n.v, b: cloneFresh(n.b), id: newId };
  }
  const newId = nextId();
  if (substOriginMap) substOriginMap[newId] = n.id;
  return { t: 'app', f: cloneFresh(n.f), a: cloneFresh(n.a), id: newId };
}

function cloneKeep(n) {
  if (n.t === 'var') return { t: 'var', v: n.v, id: n.id };
  if (n.t === 'lam') return { t: 'lam', v: n.v, b: cloneKeep(n.b), id: n.id };
  return { t: 'app', f: cloneKeep(n.f), a: cloneKeep(n.a), id: n.id };
}

// Structural equality on AST shape (ignores ids). Used by loop detector.
function structuralKey(n) {
  if (n.t === 'var') return 'v:' + n.v;
  if (n.t === 'lam') return 'l:' + n.v + ':(' + structuralKey(n.b) + ')';
  return 'a:(' + structuralKey(n.f) + ',' + structuralKey(n.a) + ')';
}
