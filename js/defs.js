// ═══════════════════════════════════════
// BUILT-IN DEFINITIONS + USER DEF STORAGE
// ═══════════════════════════════════════
const BUILTIN_DEFS = {
  // Combinators
  'I':     '\\x. x',
  'K':     '\\x. \\y. x',
  'S':     '\\x. \\y. \\z. x z (y z)',
  'B':     '\\f. \\g. \\x. f (g x)',
  'C':     '\\f. \\x. \\y. f y x',
  'W':     '\\f. \\x. f x x',
  'Y':     '\\f. (\\x. f (x x)) (\\x. f (x x))',
  'Z':     '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))',
  'omega': '(\\x. x x) (\\x. x x)',
  'id':    '\\x. x',

  // Booleans
  'true':  '\\x. \\y. x',
  'false': '\\x. \\y. y',
  'not':   '\\b. b false true',
  'and':   '\\p. \\q. p q p',
  'or':    '\\p. \\q. p p q',
  'xor':   '\\p. \\q. p (not q) q',
  'if':    '\\p. \\a. \\b. p a b',

  // Pairs
  'pair':  '\\x. \\y. \\f. f x y',
  'fst':   '\\p. p true',
  'snd':   '\\p. p false',

  // Naturals
  'succ':   '\\n. \\f. \\x. f (n f x)',
  'plus':   '\\m. \\n. \\f. \\x. m f (n f x)',
  'mult':   '\\m. \\n. \\f. m (n f)',
  'pow':    '\\m. \\n. n m',
  'pred':   '\\n. \\f. \\x. n (\\g. \\h. h (g f)) (\\u. x) (\\u. u)',
  'sub':    '\\m. \\n. n pred m',
  'iszero': '\\n. n (\\x. false) true',
  'leq':    '\\m. \\n. iszero (sub m n)',
  'eq':     '\\m. \\n. and (leq m n) (leq n m)',

  // Church Lists (Church-encoded right fold)
  // A list is `\c. \n. c x1 (c x2 (... (c xk n)))` — folds with cons-style
  // function `c` over a base case `n`. nil is the empty fold; cons prepends.
  'nil':    '\\c. \\n. n',
  'cons':   '\\h. \\t. \\c. \\n. c h (t c n)',
  'isnil':  '\\l. l (\\h. \\t. false) true',
  'length': '\\l. l (\\h. \\r. succ r) 0',
  'head':   '\\l. l (\\h. \\t. h) nil',
  'map':    '\\f. \\l. l (\\h. \\t. cons (f h) t) nil',
  'append': '\\xs. \\ys. xs cons ys',
  'sum':    '\\l. l plus 0',

  // Church list insertion sort
  'tail': '\\l. fst (l (\\h. \\p. pair (snd p) (cons h (snd p))) (pair nil nil))',
  'insert': 'Y (\\rec. \\x. \\l. if (isnil l) (cons x nil) (if (leq x (head l)) (cons x l) (cons (head l) (rec x (tail l)))))',
  'insert_sort': 'Y (\\sort. \\l. if (isnil l) nil (insert (head l) (sort (tail l))))',
  
  // Scott lists
  // A Scott list is (to be added)
  'snil':   '\\n. \\c. n',
  'scons':  '\\h. \\t. \\n. \\c. c h t',
  'sisnil': '\\l. l true (\\h. \\t. false)',
  'shead':  '\\l. l nil (\\h. \\t. h)',
  'stail':  '\\l. l snil (\\h. \\t. t)',

  // Scott list insertion sort
  'sinsert': 'Y (\\rec. \\x. \\l. l (scons x snil) (\\h. \\t. if (leq x h) (scons x (scons h t)) (scons h (rec x t))))',
  'sinsert_sort': 'Y (\\sort. \\l. l snil (\\h. \\t. sinsert h (sort t)))',
  
};


  
const CATEGORIES = [
  ['Combinators', ['I', 'K', 'S', 'B', 'C', 'W', 'Y', 'Z', 'omega', 'id']],
  ['Booleans',    ['true', 'false', 'not', 'and', 'or', 'xor', 'if']],
  ['Pairs',       ['pair', 'fst', 'snd']],
  ['Naturals',    ['succ', 'plus', 'mult', 'pow', 'pred', 'sub', 'iszero', 'leq', 'eq']],
  ['Church Lists',['nil', 'cons', 'isnil', 'length', 'head', 'tail', 'map', 'append', 'sum', 'insert', 'insert_sort']],
  ['Scott Lists', ['snil', 'scons', 'sisnil', 'shead', 'stail', 'sinsert', 'sinsert_sort']]
];

const STORAGE_KEY = 'tromp_diagram_user_defs';
const HISTORY_KEY = 'tromp_diagram_expr_history';
let memoryDefs = {};

function loadUserDefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const migrated = {};
    for (const [name, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        migrated[name] = { expr: val, category: 'User' };
      } else if (val && typeof val.expr === 'string') {
        migrated[name] = { expr: val.expr, category: val.category || 'User' };
      }
    }
    return migrated;
  } catch {
    return { ...memoryDefs };
  }
}

function saveUserDefs(defs) {
  memoryDefs = { ...defs };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defs)); } catch {}
}

let userDefs = loadUserDefs();

function userDefExpr(name) {
  const v = userDefs[name];
  return v ? v.expr : undefined;
}

function userDefCategory(name) {
  const v = userDefs[name];
  return v ? (v.category || 'User') : 'User';
}

function allDefs() {
  const out = { ...BUILTIN_DEFS };
  for (const [name, val] of Object.entries(userDefs)) {
    out[name] = val.expr;
  }
  return out;
}

function allUserCategories() {
  const cats = new Set();
  for (const val of Object.values(userDefs)) cats.add(val.category || 'User');
  return Array.from(cats).sort();
}

// ── Expression history ──────────────────────────────
const HISTORY_MAX = 30;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch {}
}

function pushHistory(expr) {
  if (!expr || !expr.trim()) return;
  const e = expr.trim();
  let h = loadHistory();
  h = h.filter(x => x !== e);
  h.unshift(e);
  if (h.length > HISTORY_MAX) h = h.slice(0, HISTORY_MAX);
  saveHistory(h);
}

function removeFromHistory(expr) {
  let h = loadHistory();
  h = h.filter(x => x !== expr);
  saveHistory(h);
}

function clearHistory() { saveHistory([]); }
