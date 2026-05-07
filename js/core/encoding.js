// ═══════════════════════════════════════
// BLC, DE BRUIJN, α-EQUIVALENCE, RECOGNITION
// ═══════════════════════════════════════

// BLC: variable de Bruijn n  → 1^(n+1) 0;  λ M → 00 M;  M N → 01 M N
function toBLC(node, scope = []) {
  if (node.t === 'var') {
    const idx = scope.indexOf(node.v);
    if (idx === -1) return null;
    return '1'.repeat(idx + 1) + '0';
  }
  if (node.t === 'lam') {
    const inner = toBLC(node.b, [node.v, ...scope]);
    if (inner === null) return null;
    return '00' + inner;
  }
  const f = toBLC(node.f, scope);
  const a = toBLC(node.a, scope);
  if (f === null || a === null) return null;
  return '01' + f + a;
}

// Decode BLC bit-string back to AST. Throws on malformed input.
function fromBLC(bits) {
  let i = 0;
  function parse() {
    if (i + 1 >= bits.length) throw new Error('BLC: unexpected end');
    const a = bits[i], b = bits[i + 1];
    i += 2;
    if (a === '0' && b === '0') {
      const body = parse();
      return mkLam('x' + (varCounter++), body);
    }
    if (a === '0' && b === '1') {
      const f = parse();
      const x = parse();
      return mkApp(f, x);
    }
    // variable: count consecutive 1s starting at position i-2
    // Re-read: we already consumed two 1s? No — for var, encoding is 1^(n+1) 0
    // So we need to recount from position i-2.
    // Roll back and re-parse properly:
    // Actually the leading bit was '1', so this is a var; total leading ones starts at i-2.
    let n = 0;
    let j = i - 2;
    while (j < bits.length && bits[j] === '1') { n++; j++; }
    if (bits[j] !== '0') throw new Error('BLC: malformed variable');
    i = j + 1;
    // de Bruijn index n-1; we don't have a scope here — give a placeholder.
    return { t: 'var', v: '#' + (n - 1), id: nextId() };
  }
  let varCounter = 0;
  const ast = parse();
  return ast;
}

function toDeBruijn(node, scope = []) {
  if (node.t === 'var') {
    const idx = scope.indexOf(node.v);
    return idx === -1 ? node.v : String(idx);
  }
  if (node.t === 'lam') {
    return 'λ. ' + toDeBruijn(node.b, [node.v, ...scope]);
  }
  const f = node.f.t === 'lam' ? '(' + toDeBruijn(node.f, scope) + ')' : toDeBruijn(node.f, scope);
  const a = node.a.t === 'var' ? toDeBruijn(node.a, scope) : '(' + toDeBruijn(node.a, scope) + ')';
  return f + ' ' + a;
}

function alphaEqual(a, b, scopeA = [], scopeB = []) {
  if (a.t !== b.t) return false;
  if (a.t === 'var') {
    const ia = scopeA.indexOf(a.v);
    const ib = scopeB.indexOf(b.v);
    if (ia === -1 && ib === -1) return a.v === b.v;
    return ia === ib;
  }
  if (a.t === 'lam') {
    return alphaEqual(a.b, b.b, [a.v, ...scopeA], [b.v, ...scopeB]);
  }
  return alphaEqual(a.f, b.f, scopeA, scopeB) && alphaEqual(a.a, b.a, scopeA, scopeB);
}

function recognizeChurchNumeral(node) {
  if (node.t !== 'lam') return null;
  const fName = node.v;
  const inner = node.b;
  if (inner.t !== 'lam') return null;
  const xName = inner.v;
  let body = inner.b;
  let count = 0;
  while (body.t === 'app') {
    if (body.f.t !== 'var' || body.f.v !== fName) return null;
    body = body.a;
    count++;
    if (count > 10000) return null;
  }
  if (body.t === 'var' && body.v === xName) return count;
  return null;
}

// Church-encoded list: `\c. \n. c x1 (c x2 (... (c xk n)))`.
// Returns an array of element ASTs, or null if `node` doesn't match.
// Note: `\c. \n. n` matches both an empty list AND Church numeral 0.
function recognizeChurchList(node, maxLen = 1000) {
  if (node.t !== 'lam') return null;

  const cName = node.v;
  const inner = node.b;

  if (inner.t !== 'lam') return null;

  const nName = inner.v;

  function isVarNamed(x, name) {
    return x && x.t === 'var' && x.v === name;
  }

  function parseBody(body, depth = 0) {
    if (depth > maxLen) return null;

    // Empty tail: n
    if (isVarNamed(body, nName)) {
      return [];
    }

    // Normal cons spine:
    // c h tail
    // AST = app(app(c, h), tail)
    if (body.t === 'app' && body.f && body.f.t === 'app') {
      const left = body.f;
      const maybeC = left.f;
      const head = left.a;
      const tail = body.a;

      if (isVarNamed(maybeC, cName)) {
        const rest = parseBody(tail, depth + 1);
        if (rest === null) return null;
        return [head, ...rest];
      }
    }

    // Partially expanded tail:
    // someChurchList c n
    // AST = app(app(someChurchList, c), n)
    //
    // Example:
    // \c.\n. c a ((\c.\n. c b n) c n)
    if (
      body.t === 'app' &&
      isVarNamed(body.a, nName) &&
      body.f &&
      body.f.t === 'app' &&
      isVarNamed(body.f.a, cName)
    ) {
      const maybeList = body.f.f;
      const nested = recognizeChurchList(maybeList, maxLen - depth);
      if (nested !== null) return nested;
    }

    return null;
  }

  return parseBody(inner.b);
}


function recognizeScottList(node, maxLen = 1000) {
  const elements = [];
  let cur = node;

  for (let i = 0; i < maxLen; i++) {
    // nil = \n.\c. n
    if (cur.t === 'lam') {
      const nName = cur.v;
      const inner = cur.b;

      if (inner.t !== 'lam') return null;

      const cName = inner.v;
      const body = inner.b;

      // nil case
      if (body.t === 'var' && body.v === nName) {
        return elements;
      }

      // cons h t = \n.\c. c h t
      if (body.t !== 'app') return null;

      const left = body.f;
      const tail = body.a;

      if (left.t !== 'app') return null;

      const c = left.f;
      const head = left.a;

      if (c.t !== 'var' || c.v !== cName) return null;

      elements.push(head);
      cur = tail;
      continue;
    }

    return null;
  }

  return null;
}

// ── Applied-form list recognition ───────────────────────────────────────
// recognizeChurchList / recognizeScottList only match the β-NORMAL forms
// (`\c.\n. c h … n` and `\n.\c. c h …`). When the user types
// `cons 1 (cons 2 nil)` the elaborated AST is `app(app(consE, 1), app(…))` —
// it isn't a lambda yet, so structural recognition fails until they Run.
// These helpers spot the cons-application chain directly via α-equality with
// the cons/nil definitions, so a list is recognized BEFORE β-reduction too.
let _churchConsNilCache = null;
let _scottConsNilCache = null;
function getChurchConsNil() {
  if (_churchConsNilCache !== null) return _churchConsNilCache || null;
  try {
    _churchConsNilCache = {
      cons: elaborate(parse(BUILTIN_DEFS.cons), BUILTIN_DEFS),
      nil:  elaborate(parse(BUILTIN_DEFS.nil),  BUILTIN_DEFS),
    };
  } catch { _churchConsNilCache = false; return null; }
  return _churchConsNilCache;
}
function getScottConsNil() {
  if (_scottConsNilCache !== null) return _scottConsNilCache || null;
  try {
    _scottConsNilCache = {
      cons: elaborate(parse(BUILTIN_DEFS.scons), BUILTIN_DEFS),
      nil:  elaborate(parse(BUILTIN_DEFS.snil),  BUILTIN_DEFS),
    };
  } catch { _scottConsNilCache = false; return null; }
  return _scottConsNilCache;
}

// Walks `cons h₁ (cons h₂ (… nil))` and returns the element ASTs, or null
// if the term doesn't match. Works regardless of β-reduction state — only
// requires α-equality with the cons/nil definitions provided in `defs`.
function recognizeAppliedList(node, defs, maxLen = 500) {
  if (!defs) return null;
  const elements = [];
  let cur = node;
  for (let i = 0; i < maxLen; i++) {
    if (alphaEqual(cur, defs.nil)) return elements;
    if (cur && cur.t === 'app' && cur.f && cur.f.t === 'app' &&
        alphaEqual(cur.f.f, defs.cons)) {
      elements.push(cur.f.a);
      cur = cur.a;
      continue;
    }
    return null;
  }
  return null;
}

// Church-encoded pair: `\s. s a b`. Returns {fst, snd} or null.
function recognizeChurchPair(node) {
  if (node.t !== 'lam') return null;
  const sName = node.v;
  const body = node.b;
  if (body.t !== 'app') return null;
  const head = body.f;
  if (head.t !== 'app') return null;
  if (head.f.t !== 'var' || head.f.v !== sName) return null;
  // Make sure the inner term doesn't reference sName outside of the head
  // position — that would make it a more complex term, not a plain pair.
  // (Lightweight check: just structural recognition is enough for display.)
  return { fst: head.a, snd: body.a };
}

// Compact, recognition-aware printer for a single sub-term, used to format
// list elements and pair components. Tries (in order): Church numeral,
// short variable, named def via α-equality. Falls back to "…".
function formatNodeShort(node) {
  const n = recognizeChurchNumeral(node);
  if (n !== null) return String(n);

  // Try Scott list first (β-normal then applied form).
  let scottList = recognizeScottList(node);
  if (scottList === null) scottList = recognizeAppliedList(node, getScottConsNil());
  if (scottList !== null) {
    return '[' + scottList.map(formatNodeShort).join(', ') + ']';
  }

  // Then Church list (β-normal then applied form).
  let churchList = recognizeChurchList(node);
  if (churchList === null) churchList = recognizeAppliedList(node, getChurchConsNil());
  if (churchList !== null) {
    return '[' + churchList.map(formatNodeShort).join(', ') + ']';
  }

  if (node.t === 'var') return node.v;

  try {
    const defs = allDefs();
    for (const [name, expr] of Object.entries(defs)) {
      if (name === 'nil' || name === 'true' || name === 'false') continue;
      const parsed = elaborate(parse(expr), defs);
      if (alphaEqual(node, parsed)) return name;
    }
  } catch {}

  return '…';
}

function recognize(node) {
  const matches = [];

  // 1. Church numeral.
  const n = recognizeChurchNumeral(node);
  if (n !== null) matches.push(`${n} (Church numeral)`);

  // 2. Church list — try the β-normal `\c.\n. …` form first, then fall
  // back to the applied chain `cons h (cons … nil)` so the user gets a
  // readable result even before clicking Run.
  let churchList = recognizeChurchList(node);
  if (churchList === null) churchList = recognizeAppliedList(node, getChurchConsNil());
  if (churchList !== null) {
    if (churchList.length === 0) matches.push('[] (Church empty list)');
    else matches.push('[' + churchList.map(formatNodeShort).join(', ') + '] (Church list of ' + churchList.length + ')');
  }

  // 3. Scott list — same dual recognition.
  let scottList = recognizeScottList(node);
  if (scottList === null) scottList = recognizeAppliedList(node, getScottConsNil());
  if (scottList !== null) {
    if (scottList.length === 0) matches.push('[] (Scott empty list)');
    else matches.push('[' + scottList.map(formatNodeShort).join(', ') + '] (Scott list of ' + scottList.length + ')');
  }

  // 4. Church pair — only flag when the term isn't already a 1-element
  // list, since `\s. s a b` is structurally identical to `[a]` (with `b`
  // playing the role of nil).
  const oneElemList =
    (churchList !== null && churchList.length === 1) ||
    (scottList !== null && scottList.length === 1);
  if (!oneElemList) {
    const pair = recognizeChurchPair(node);
    if (pair) {
      matches.push('(' + formatNodeShort(pair.fst) + ', ' + formatNodeShort(pair.snd) + ') (pair)');
    }
  }

  // 5. Named-def matches via α-equality.
  const defs = allDefs();
  for (const [name, expr] of Object.entries(defs)) {
    let parsed;
    try { parsed = elaborate(parse(expr), defs); }
    catch { continue; }
    if (alphaEqual(node, parsed)) matches.push(name);
  }
  return Array.from(new Set(matches));
}
