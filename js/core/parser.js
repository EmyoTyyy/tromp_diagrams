// ═══════════════════════════════════════
// PARSER  —  λ-calculus syntax with optional `let` sugar
//
// Surface syntax accepted:
//   \x. body            classic abstraction (also λx. body)
//   \x y z. body        sugar for λx.λy.λz. body
//   M N P               left-associative application
//   (M)                 grouping
//   let x = e1 in e2    parse-time macro: e1 is substituted for x in e2.
//                       The let leaves no trace in the AST — the diagram
//                       shows only the substituted lambda code.
//   let x = e1; y = e2 in e3   chained lets, applied left-to-right
//                              (later bindings can use earlier ones).
//   letrec x = e1 in e2 same as let, but the rhs is wrapped in Y so
//                       it can reference itself.
//   \x. \y. body  is also valid (no syntactic difference)
// ═══════════════════════════════════════

// Capture-avoiding substitution on the named AST.  Used by the let macro
// at parse time, so it doesn't need IDs from the rest of the pipeline —
// fresh nodes will get their ids from the mk* helpers in ast.js.
function _letFreeVars(n, acc) {
  acc = acc || new Set();
  if (n.t === 'var') { acc.add(n.v); return acc; }
  if (n.t === 'lam') {
    const inner = new Set();
    _letFreeVars(n.b, inner);
    inner.delete(n.v);
    for (const v of inner) acc.add(v);
    return acc;
  }
  _letFreeVars(n.f, acc);
  _letFreeVars(n.a, acc);
  return acc;
}
function _letFreshName(base, avoid) {
  const root = base.replace(/'+$/, '');
  let cand = root + "'";
  while (avoid.has(cand)) cand += "'";
  return cand;
}
function _letCloneNamed(n) {
  if (n.t === 'var') return mkVar(n.v);
  if (n.t === 'lam') return mkLam(n.v, _letCloneNamed(n.b));
  return mkApp(_letCloneNamed(n.f), _letCloneNamed(n.a));
}
function _letSubst(body, name, value) {
  if (body.t === 'var') {
    return body.v === name ? _letCloneNamed(value) : mkVar(body.v);
  }
  if (body.t === 'lam') {
    // Inner λ shadows the outer name → stop substituting in this branch.
    if (body.v === name) return mkLam(body.v, _letCloneNamed(body.b));
    let v = body.v, b = body.b;
    // If the binder's name would capture a free var of `value`, α-rename
    // the binder first so the substituted occurrences stay free.
    const fvV = _letFreeVars(value);
    if (fvV.has(v)) {
      const avoid = new Set([...fvV, ...(_letFreeVars(b)), name]);
      const newV = _letFreshName(v, avoid);
      b = _letSubst(b, v, mkVar(newV));
      v = newV;
    }
    return mkLam(v, _letSubst(b, name, value));
  }
  return mkApp(_letSubst(body.f, name, value), _letSubst(body.a, name, value));
}

function tokenize(s) {
  s = s.replace(/λ/g, '\\');
  const T = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    // line comment: # ... \n
    if (c === '#') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '\\') { T.push('L'); i++; continue; }
    if (c === '.') { T.push('D'); i++; continue; }
    if (c === '(') { T.push('('); i++; continue; }
    if (c === ')') { T.push(')'); i++; continue; }
    if (c === '=') { T.push('EQ'); i++; continue; }
    if (c === ';') { T.push('SC'); i++; continue; }
    if (/[a-zA-Z0-9_']/.test(c)) {
      let w = '';
      while (i < s.length && /[a-zA-Z0-9_']/.test(s[i])) w += s[i++];
      // keywords
      if (w === 'let')    { T.push('LET');    continue; }
      if (w === 'letrec') { T.push('LETREC'); continue; }
      if (w === 'in')     { T.push('IN');     continue; }
      T.push({ v: w });
      continue;
    }
    throw new Error(`Unknown char: '${c}'`);
  }
  return T;
}

class Parser {
  constructor(T) { this.T = T; this.i = 0; }
  peek() { return this.T[this.i]; }
  eat()  { return this.T[this.i++]; }
  expect(x) { const t = this.eat(); if (t !== x) throw new Error(`Expected ${x}`); }

  term() {
    if (this.peek() === 'L')      return this.lam();
    if (this.peek() === 'LET')    return this.letExpr(false);
    if (this.peek() === 'LETREC') return this.letExpr(true);
    return this.app();
  }

  lam() {
    this.eat(); // consume L
    const vs = [];
    while (this.peek() && typeof this.peek() === 'object') vs.push(this.eat().v);
    if (!vs.length) throw new Error('λ needs variable');
    this.expect('D');
    let b = this.term();
    for (let j = vs.length - 1; j >= 0; j--) b = mkLam(vs[j], b);
    return b;
  }

  // `let` is a parse-time macro: the value is substituted directly into
  // the body. After parsing, there's no `(\x. body) value` redex in the
  // AST — just the substituted lambda code. So `let recu = Y in 3`
  // produces just `3` (recu isn't used in 3, so Y disappears entirely),
  // while `let f = \x. x in f y` produces `(\x. x) y`.
  //
  // For `letrec`, the value is first wrapped in `Y (\name. value)` so
  // it can reference itself recursively, then substituted in the same way.
  letExpr(recursive) {
    this.eat(); // consume LET / LETREC
    const bindings = [];
    while (true) {
      const nameTok = this.eat();
      if (!nameTok || typeof nameTok !== 'object') throw new Error('let: expected name');
      this.expect('EQ');
      const value = this.term();
      bindings.push({ name: nameTok.v, value });
      if (this.peek() === 'SC') { this.eat(); continue; }
      break;
    }
    if (this.peek() !== 'IN') throw new Error("let: expected 'in'");
    this.eat(); // consume IN
    let body = this.term();
    // Apply substitutions right-to-left so a later binding sees the
    // earlier ones as already-substituted values (lexical scoping).
    for (let j = bindings.length - 1; j >= 0; j--) {
      const v = recursive
        ? mkApp(mkVar('Y'), mkLam(bindings[j].name, bindings[j].value))
        : bindings[j].value;
      body = _letSubst(body, bindings[j].name, v);
    }
    return body;
  }

  app() {
    let L = this.atom();
    while (true) {
      const p = this.peek();
      if (!p || p === ')' || p === 'D' || p === 'IN' || p === 'SC' || p === 'EQ') break;
      if (p === 'L' || p === '(' || p === 'LET' || p === 'LETREC' || typeof p === 'object') {
        L = mkApp(L, this.atom());
      } else break;
    }
    return L;
  }

  atom() {
    const p = this.peek();
    if (!p) throw new Error('Unexpected end');
    if (typeof p === 'object') { this.eat(); return mkVar(p.v); }
    if (p === '(')      { this.eat(); const e = this.term(); this.expect(')'); return e; }
    if (p === 'L')      return this.lam();
    if (p === 'LET')    return this.letExpr(false);
    if (p === 'LETREC') return this.letExpr(true);
    throw new Error(`Unexpected: ${p}`);
  }
}

function parse(src) {
  const T = tokenize(src.trim());
  if (T.length === 0) throw new Error('Empty expression');
  const p = new Parser(T);
  const e = p.term();
  if (p.i < p.T.length) throw new Error('Trailing tokens');
  return e;
}
