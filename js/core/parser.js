// ═══════════════════════════════════════
// PARSER  —  λ-calculus syntax with optional `let` sugar
//
// Surface syntax accepted:
//   \x. body            classic abstraction (also λx. body)
//   \x y z. body        sugar for λx.λy.λz. body
//   M N P               left-associative application
//   (M)                 grouping
//   let x = e1 in e2    desugars to (\x. e2) e1
//   let x = e1; y = e2 in e3   chained lets
//   \x. \y. body  is also valid (no syntactic difference)
// ═══════════════════════════════════════

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

  // let     x = e1 [; y = e2 ; ...] in body  →  (\x. (\y. ... body) e2) e1
  // letrec  x = e1 [; ...]            in body  →  (\x. (...) body) (Y (\x. e1))
  //   — wraps each rhs with `Y (\name. rhs)` so the binding can reference
  //   itself. Multiple bindings get sequential (non-mutual) recursion.
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
    // Build right-to-left so the outer-most is the first binding
    for (let j = bindings.length - 1; j >= 0; j--) {
      const v = recursive
        ? mkApp(mkVar('Y'), mkLam(bindings[j].name, bindings[j].value))
        : bindings[j].value;
      body = mkApp(mkLam(bindings[j].name, body), v);
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
