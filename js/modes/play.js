// ═══════════════════════════════════════
// PLAY MODE — guess the expression from a Tromp diagram
//
// Game lifecycle:
//   1. Player clicks a mode button → enters PRE-GAME (diagram blurred,
//      Start button + difficulty picker overlaid).
//   2. Player picks a difficulty (skipped for daily) and clicks Start →
//      PLAYING (timer starts, counters reset, first puzzle drawn).
//   3. Solving advances; Reveal/Skip/wrong-answer have well-defined
//      consequences (see advanceAfterSolve, giveUp, skipPuzzle).
//   4. Abandon (or running out of options/levels) ends the run and
//      shows the endgame popup with the per-mode per-difficulty best.
//
// Scoring: a level is worth `level_difficulty * 8 + speed_bonus
// − attempt_penalty`, halved if the player used the colour hint that
// round. Non-colour hints are free in points but capped at 10/run.
// ═══════════════════════════════════════

// ── Static puzzle list (used by daily generator + fallback) ─────
const PUZZLES = [
  { name: 'I',     expr: '\\x. x',                   difficulty: 1, accepts: ['I', '\\x. x', 'id'] },
  { name: 'K',     expr: '\\x. \\y. x',              difficulty: 1, accepts: ['K', '\\x. \\y. x', 'true', '\\x y. x'] },
  { name: 'false', expr: '\\x. \\y. y',              difficulty: 1, accepts: ['false', '\\x. \\y. y', '\\x y. y'] },
  { name: '0',     expr: '\\f. \\x. x',              difficulty: 1, accepts: ['0', 'false', '\\f. \\x. x'] },
  { name: '1',     expr: '\\f. \\x. f x',            difficulty: 2, accepts: ['1', '\\f. \\x. f x'] },
  { name: '2',     expr: '\\f. \\x. f (f x)',        difficulty: 2, accepts: ['2', '\\f. \\x. f (f x)'] },
  { name: '3',     expr: '\\f. \\x. f (f (f x))',    difficulty: 2, accepts: ['3', '\\f. \\x. f (f (f x))'] },
  { name: 'not',   expr: '\\b. b false true',        difficulty: 3, accepts: ['not', '\\b. b false true'] },
  { name: 'and',   expr: '\\p. \\q. p q p',          difficulty: 3, accepts: ['and', '\\p. \\q. p q p'] },
  { name: 'or',    expr: '\\p. \\q. p p q',          difficulty: 3, accepts: ['or', '\\p. \\q. p p q'] },
  { name: 'if',    expr: '\\p. \\a. \\b. p a b',     difficulty: 3, accepts: ['if', '\\p. \\a. \\b. p a b'] },
  { name: 'pair (incomplete)', expr: '\\x. \\y. \\f. f x y', difficulty: 3, accepts: ['pair', '\\x. \\y. \\f. f x y'] },
  { name: 'B',     expr: '\\f. \\g. \\x. f (g x)',   difficulty: 3, accepts: ['B', '\\f. \\g. \\x. f (g x)'] },
  { name: '4',     expr: '\\f. \\x. f (f (f (f x)))', difficulty: 3, accepts: ['4', '\\f. \\x. f (f (f (f x)))'] },
  { name: 'C',     expr: '\\f. \\x. \\y. f y x',     difficulty: 4, accepts: ['C', '\\f. \\x. \\y. f y x'] },
  { name: 'W',     expr: '\\f. \\x. f x x',          difficulty: 4, accepts: ['W', '\\f. \\x. f x x'] },
  { name: 'S',     expr: '\\x. \\y. \\z. x z (y z)', difficulty: 4, accepts: ['S', '\\x. \\y. \\z. x z (y z)'] },
  { name: 'xor',   expr: '\\p. \\q. p (not q) q',    difficulty: 4, accepts: ['xor', '\\p. \\q. p (not q) q'] },
  { name: 'iszero', expr: '\\n. n (\\x. false) true', difficulty: 4, accepts: ['iszero', '\\n. n (\\x. false) true'] },
  { name: 'succ',  expr: '\\n. \\f. \\x. f (n f x)', difficulty: 5, accepts: ['succ', '\\n. \\f. \\x. f (n f x)'] },
  { name: 'plus',  expr: '\\m. \\n. \\f. \\x. m f (n f x)', difficulty: 5, accepts: ['plus', '\\m. \\n. \\f. \\x. m f (n f x)'] },
  { name: 'mult',  expr: '\\m. \\n. \\f. m (n f)',   difficulty: 5, accepts: ['mult', '\\m. \\n. \\f. m (n f)'] },
  { name: 'pow',   expr: '\\m. \\n. n m',            difficulty: 5, accepts: ['pow', '\\m. \\n. n m'] },
  { name: 'nil',   expr: '\\c. \\n. n',              difficulty: 5, accepts: ['nil', '0', 'false', '\\c. \\n. n'] },
  { name: 'cons',  expr: '\\h. \\t. \\c. \\n. c h (t c n)', difficulty: 6, accepts: ['cons', '\\h. \\t. \\c. \\n. c h (t c n)'] },
  { name: 'isnil', expr: '\\l. l (\\h. \\t. false) true', difficulty: 6, accepts: ['isnil', '\\l. l (\\h. \\t. false) true'] },
  { name: 'length', expr: '\\l. l (\\h. \\r. succ r) 0', difficulty: 6, accepts: ['length', '\\l. l (\\h. \\r. succ r) 0'] },
  { name: 'sub',   expr: '\\m. \\n. n pred m',       difficulty: 6, accepts: ['sub', '\\m. \\n. n pred m'] },
  { name: 'leq',   expr: '\\m. \\n. iszero (sub m n)', difficulty: 7, accepts: ['leq', '\\m. \\n. iszero (sub m n)'] },
  { name: 'eq',    expr: '\\m. \\n. and (leq m n) (leq n m)', difficulty: 7, accepts: ['eq', '\\m. \\n. and (leq m n) (leq n m)'] },
  { name: 'omega', expr: '(\\x. x x) (\\x. x x)',    difficulty: 6, accepts: ['omega', '(\\x. x x) (\\x. x x)'] },
  { name: 'Y',     expr: '\\f. (\\x. f (x x)) (\\x. f (x x))', difficulty: 7, accepts: ['Y', '\\f. (\\x. f (x x)) (\\x. f (x x))'] },
  { name: 'Z',     expr: '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))', difficulty: 8, accepts: ['Z', '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))'] },
  { name: 'pred',  expr: '\\n. \\f. \\x. n (\\g. \\h. h (g f)) (\\u. x) (\\u. u)', difficulty: 8, accepts: ['pred'] },
];

// ── Extreme pool (10-star, special colour) ─────────────────────
// Genuinely-extreme lambda terms only. Y is intentionally NOT here —
// it reads as "hard" but not extreme. Extreme is reserved for terms
// whose diagram is uniquely dense / opaque: Z (the strict Y),
// pred (canonical hardest classical encoding), eq (deep nested
// dependency chain), and 4-deep alternating compositions.
const EXTREME_POOL = [
  { name: 'Z',     expr: '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))', accepts: ['Z'] },
  { name: 'pred',  expr: '\\n. \\f. \\x. n (\\g. \\h. h (g f)) (\\u. x) (\\u. u)', accepts: ['pred'] },
  { name: 'eq',    expr: '\\m. \\n. and (leq m n) (leq n m)', accepts: ['eq'] },
  { name: '\\x. pred (succ (pred (succ x)))',
                   expr: '\\x. pred (succ (pred (succ x)))',
                   accepts: ['\\x. pred (succ (pred (succ x)))'] },
  { name: '\\x. succ (pred (succ (pred x)))',
                   expr: '\\x. succ (pred (succ (pred x)))',
                   accepts: ['\\x. succ (pred (succ (pred x)))'] },
  { name: '\\n. n succ 0',
                   expr: '\\n. n succ 0',
                   accepts: ['\\n. n succ 0'] },
];

// ── Speedrun premade levels: 4 game-difficulties × 15 puzzles ──
// Each tier is a fixed, ordered list — the player races the same
// 15 every time within a difficulty so personal-best times are
// directly comparable across runs.
const SPEEDRUN_LEVELS = {
  easy: [
    { name: 'I',     expr: '\\x. x',                   difficulty: 1, accepts: ['I', '\\x. x', 'id'] },
    { name: 'K',     expr: '\\x. \\y. x',              difficulty: 1, accepts: ['K', '\\x. \\y. x', 'true'] },
    { name: 'false', expr: '\\x. \\y. y',              difficulty: 1, accepts: ['false', '\\x. \\y. y'] },
    { name: '0',     expr: '\\f. \\x. x',              difficulty: 1, accepts: ['0', 'false', '\\f. \\x. x'] },
    { name: '1',     expr: '\\f. \\x. f x',            difficulty: 2, accepts: ['1', '\\f. \\x. f x'] },
    { name: '2',     expr: '\\f. \\x. f (f x)',        difficulty: 2, accepts: ['2', '\\f. \\x. f (f x)'] },
    { name: '3',     expr: '\\f. \\x. f (f (f x))',    difficulty: 2, accepts: ['3', '\\f. \\x. f (f (f x))'] },
    { name: '4',     expr: '\\f. \\x. f (f (f (f x)))', difficulty: 3, accepts: ['4'] },
    { name: '5',     expr: '\\f. \\x. f (f (f (f (f x))))', difficulty: 3, accepts: ['5'] },
    { name: 'not',   expr: '\\b. b false true',        difficulty: 3, accepts: ['not'] },
    { name: 'and',   expr: '\\p. \\q. p q p',          difficulty: 3, accepts: ['and'] },
    { name: 'or',    expr: '\\p. \\q. p p q',          difficulty: 3, accepts: ['or'] },
    { name: 'if',    expr: '\\p. \\a. \\b. p a b',     difficulty: 3, accepts: ['if'] },
    { name: 'pair',  expr: '\\x. \\y. \\f. f x y',     difficulty: 3, accepts: ['pair'] },
    { name: 'B',     expr: '\\f. \\g. \\x. f (g x)',   difficulty: 3, accepts: ['B'] },
  ],
  medium: [
    { name: 'C',     expr: '\\f. \\x. \\y. f y x',     difficulty: 4, accepts: ['C'] },
    { name: 'W',     expr: '\\f. \\x. f x x',          difficulty: 4, accepts: ['W'] },
    { name: 'S',     expr: '\\x. \\y. \\z. x z (y z)', difficulty: 4, accepts: ['S'] },
    { name: 'iszero', expr: '\\n. n (\\x. false) true', difficulty: 4, accepts: ['iszero'] },
    { name: 'xor',   expr: '\\p. \\q. p (not q) q',    difficulty: 4, accepts: ['xor'] },
    { name: 'fst',   expr: '\\p. p (\\x. \\y. x)',     difficulty: 4, accepts: ['fst'] },
    { name: 'snd',   expr: '\\p. p (\\x. \\y. y)',     difficulty: 4, accepts: ['snd'] },
    { name: 'succ',  expr: '\\n. \\f. \\x. f (n f x)', difficulty: 5, accepts: ['succ'] },
    { name: 'plus',  expr: '\\m. \\n. \\f. \\x. m f (n f x)', difficulty: 5, accepts: ['plus'] },
    { name: 'mult',  expr: '\\m. \\n. \\f. m (n f)',   difficulty: 5, accepts: ['mult'] },
    { name: 'pow',   expr: '\\m. \\n. n m',            difficulty: 5, accepts: ['pow'] },
    { name: 'nil',   expr: '\\c. \\n. n',              difficulty: 5, accepts: ['nil'] },
    { name: 'plus 1 1', expr: 'plus 1 1',              difficulty: 4, accepts: ['plus 1 1'] },
    { name: 'mult 2 2', expr: 'mult 2 2',              difficulty: 5, accepts: ['mult 2 2'] },
    { name: 'pow 2 2',  expr: 'pow 2 2',               difficulty: 5, accepts: ['pow 2 2'] },
  ],
  hard: [
    { name: 'cons',  expr: '\\h. \\t. \\c. \\n. c h (t c n)', difficulty: 6, accepts: ['cons'] },
    { name: 'isnil', expr: '\\l. l (\\h. \\t. false) true', difficulty: 6, accepts: ['isnil'] },
    { name: 'length', expr: '\\l. l (\\h. \\r. succ r) 0', difficulty: 6, accepts: ['length'] },
    { name: 'sub',   expr: '\\m. \\n. n pred m',       difficulty: 6, accepts: ['sub'] },
    { name: 'omega', expr: '(\\x. x x) (\\x. x x)',    difficulty: 6, accepts: ['omega'] },
    { name: 'plus 2 3', expr: 'plus 2 3',              difficulty: 6, accepts: ['plus 2 3'] },
    { name: 'mult 2 3', expr: 'mult 2 3',              difficulty: 6, accepts: ['mult 2 3'] },
    { name: 'iszero 0', expr: 'iszero 0',              difficulty: 5, accepts: ['iszero 0', 'true'] },
    { name: 'fst (pair a b)', expr: 'fst (pair a b)',  difficulty: 5, accepts: ['fst (pair a b)'] },
    { name: 'snd (pair a b)', expr: 'snd (pair a b)',  difficulty: 5, accepts: ['snd (pair a b)'] },
    { name: '\\x. succ (succ x)', expr: '\\x. succ (succ x)', difficulty: 6, accepts: ['\\x. succ (succ x)'] },
    { name: 'leq',   expr: '\\m. \\n. iszero (sub m n)', difficulty: 7, accepts: ['leq'] },
    { name: 'eq',    expr: '\\m. \\n. and (leq m n) (leq n m)', difficulty: 7, accepts: ['eq'] },
    { name: 'Y',     expr: '\\f. (\\x. f (x x)) (\\x. f (x x))', difficulty: 7, accepts: ['Y'] },
    { name: 'pow 2 3', expr: 'pow 2 3',                difficulty: 7, accepts: ['pow 2 3'] },
  ],
  extreme: [
    { name: 'Z',     expr: '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))', difficulty: 9, accepts: ['Z'] },
    { name: 'pred',  expr: '\\n. \\f. \\x. n (\\g. \\h. h (g f)) (\\u. x) (\\u. u)', difficulty: 8, accepts: ['pred'] },
    { name: 'Y',     expr: '\\f. (\\x. f (x x)) (\\x. f (x x))', difficulty: 8, accepts: ['Y'] },
    { name: 'leq',   expr: '\\m. \\n. iszero (sub m n)', difficulty: 8, accepts: ['leq'] },
    { name: 'eq',    expr: '\\m. \\n. and (leq m n) (leq n m)', difficulty: 8, accepts: ['eq'] },
    { name: '\\x. succ (pred x)', expr: '\\x. succ (pred x)', difficulty: 8, accepts: ['\\x. succ (pred x)'] },
    { name: '\\x. pred (succ x)', expr: '\\x. pred (succ x)', difficulty: 8, accepts: ['\\x. pred (succ x)', 'I'] },
    { name: '\\x. succ (succ (succ x))', expr: '\\x. succ (succ (succ x))', difficulty: 8, accepts: ['\\x. succ (succ (succ x))'] },
    { name: '\\x. pred (pred (succ x))', expr: '\\x. pred (pred (succ x))', difficulty: 9, accepts: ['\\x. pred (pred (succ x))'] },
    { name: '\\x. iszero (pred x)', expr: '\\x. iszero (pred x)', difficulty: 9, accepts: ['\\x. iszero (pred x)'] },
    { name: '\\x. not (iszero x)', expr: '\\x. not (iszero x)', difficulty: 9, accepts: ['\\x. not (iszero x)'] },
    { name: 'pred 4', expr: 'pred 4',                  difficulty: 9, accepts: ['pred 4', '3'] },
    { name: 'sub 5 2', expr: 'sub 5 2',                difficulty: 9, accepts: ['sub 5 2', '3'] },
    { name: '\\x. mult 2 (succ x)', expr: '\\x. mult 2 (succ x)', difficulty: 9, accepts: ['\\x. mult 2 (succ x)'] },
    { name: '\\n. n succ 0', expr: '\\n. n succ 0',    difficulty: 10, accepts: ['\\n. n succ 0', 'I'] },
  ],
};

// ── Game-difficulty configuration ──────────────────────────────
// `base` → first-level difficulty target; `rate` → how fast level
// difficulty grows with progress; `cap` → maximum difficulty (max
// stars filled); `extremeChance` → probability of inserting a 10-star
// extreme-flagged level after the early-game grace period.
const GAME_DIFF_CFG = {
  easy:    { base: 1, rate: 0.40, cap: 4,  extremeChance: 0,    skipsAllowed: 3, label: 'Easy' },
  medium:  { base: 2, rate: 0.60, cap: 6,  extremeChance: 0,    skipsAllowed: 3, label: 'Medium' },
  hard:    { base: 3, rate: 0.85, cap: 9,  extremeChance: 0.18, skipsAllowed: 3, label: 'Hard' },
  extreme: { base: 10, rate: 0,    cap: 10, extremeChance: 1.0,  skipsAllowed: 0, label: 'Extreme' },
};

// ── State ──────────────────────────────────────────────────────
let playState = {
  phase: 'idle',          // idle (no mode selected) | pregame | playing | revealed | ended
  mode: null,             // 'normal' | 'daily' | 'calendar' | 'speedrun'
  gameDifficulty: 'easy', // selected on the pre-game card
  level: 0,               // levels solved this run
  score: 0,
  hintsUsed: 0,           // non-colour hints
  skipsUsed: 0,
  colorThisRound: false,  // colour hint applied in current level → score halves
  attempts: 0,
  hintLevel: 0,
  givenUp: false,         // reveal answer was clicked → input locked
  levelStartTime: 0,
  runStartTime: 0,
  // mode-specific puzzle holders
  randomPuzzle: null,
  dailyPuzzle: null,
  // normal-mode no-reuse
  usedTargets: null,
  usedFns: null,
  // current level descriptor
  levelDifficulty: 1,
  levelExtreme: false,
  runToken: 0,           // increments whenever a run/mode is reset; invalidates delayed callbacks
};

let PLAY_COLOR_ON = false;

// ── Bests storage ──────────────────────────────────────────────
// Per-mode + per-game-difficulty bests live under one key. Speedrun
// stores `time` (lowest seconds, null until a completed run); other
// modes store `{ score, streak }`. Daily summary uses the bare
// mode key with no difficulty suffix.
const BESTS_KEY = 'tromp_play_bests_v2';
function loadBests() {
  try { return JSON.parse(localStorage.getItem(BESTS_KEY)) || {}; }
  catch { return {}; }
}
function saveBests(m) {
  try { localStorage.setItem(BESTS_KEY, JSON.stringify(m)); } catch {}
}
function bestKey(mode, diff) { return diff ? mode + '_' + diff : mode; }
function getBest(mode, diff) { return loadBests()[bestKey(mode, diff)] || null; }
function bumpRunBest(mode, diff, score, streak) {
  if (!mode) return;
  const m = loadBests();
  const k = bestKey(mode, diff);
  const cur = m[k] || { score: 0, streak: 0 };
  if (score > cur.score) cur.score = score;
  if (streak > cur.streak) cur.streak = streak;
  m[k] = cur;
  saveBests(m);
}
function getSpeedrunBest(diff) {
  return loadBests()[bestKey('speedrun', diff) + '_time'] || null;
}
function setSpeedrunBest(diff, seconds) {
  const m = loadBests();
  const k = bestKey('speedrun', diff) + '_time';
  if (m[k] == null || seconds < m[k]) {
    m[k] = seconds;
    saveBests(m);
  }
}

// ── Daily date-seeded RNG (preserved from previous version) ────
const DAILY_KEY = 'tromp_play_daily';
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function dailyRng(dateKey) {
  let h = 2166136261;
  for (const c of dateKey) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Closed-term generator (ported from Ressources/daily_generator.html) ─
// Builds a closed λ-expression by walking down to maxDepth, pulling free
// variables only from the running `context` of in-scope binders. Variable
// names are unique within the term so the resulting diagram is unambiguous
// and dense.
//
// `rngFn` is the seeded RNG to consume — when called from daily we pass
// `dailyRng(dateKey)`, when called from procedural difficulty-7+ we pass
// Math.random.
function generateClosedLambdaExpression(rngFn, maxDepth, shape) {
  const baseVars = ['x','y','z','a','b','c','f','g','h','m','n','p','q','r','s','u','v','w'];
  const targetFactor = { balanced: 4.9, mixed: 4.5, deep: 3.7 };
  const targetChars = Math.floor(maxDepth * maxDepth * (targetFactor[shape] || 4.2));
  const minChars = Math.floor(targetChars * 0.84);
  const maxChars = Math.ceil(targetChars * 1.20);
  const maxAttempts = 40;
  let best = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let nextVarIndex = 0;
    function pick(arr) { return arr[Math.floor(rngFn() * arr.length)]; }
    function freshVar() {
      if (nextVarIndex < baseVars.length) return baseVars[nextVarIndex++];
      return 'v' + (nextVarIndex++);
    }
    function chances(depth) {
      const progress = 1 - depth / maxDepth;
      const stillTooHigh = depth > maxDepth * 0.45;
      if (shape === 'balanced') {
        if (stillTooHigh) return { variable: 0, abstraction: 0.28, nestedApplication: 0 };
        return { variable: 0.06 + progress * 0.46, abstraction: 0.30, nestedApplication: 0 };
      }
      if (shape === 'mixed') {
        if (stillTooHigh) return { variable: 0, abstraction: 0.39, nestedApplication: 0.20 };
        return { variable: 0.05 + progress * 0.43, abstraction: 0.36,
                 nestedApplication: Math.max(0.07, 0.20 - progress * 0.09) };
      }
      if (stillTooHigh) return { variable: 0, abstraction: 0.58, nestedApplication: 0.30 };
      return { variable: 0.05 + progress * 0.35, abstraction: 0.46,
               nestedApplication: Math.max(0.12, 0.34 - progress * 0.13) };
    }
    function gen(depth, context) {
      if (depth <= 0) return pick(context);
      if (context.length === 0) {
        const v = freshVar();
        return '(\\' + v + '. ' + gen(depth - 1, context.concat([v])) + ')';
      }
      const p = chances(depth);
      const choice = rngFn();
      if (choice < p.variable) return pick(context);
      if (choice < p.variable + p.abstraction) {
        const v = freshVar();
        return '(\\' + v + '. ' + gen(depth - 1, context.concat([v])) + ')';
      }
      if (choice < p.variable + p.abstraction + p.nestedApplication) return genNested(depth, context);
      return genBalanced(depth, context);
    }
    function genBalanced(depth, context) {
      if (shape === 'deep' && rngFn() < 0.58) return genNested(depth, context);
      return '(' + gen(depth - 1, context) + ' ' + gen(depth - 1, context) + ')';
    }
    function genNested(depth, context) {
      const chainLength = shape === 'deep' ? 2 + Math.floor(rngFn() * 4)
                                           : 2 + Math.floor(rngFn() * 3);
      let expr = gen(depth - 1, context);
      for (let i = 0; i < chainLength; i++) {
        const argDepth = Math.max(0, depth - 2 - i);
        const extendRight = shape === 'deep' ? rngFn() < 0.78 : rngFn() < 0.62;
        if (extendRight) expr = '(' + expr + ' ' + gen(argDepth, context) + ')';
        else             expr = '(' + gen(argDepth, context) + ' ' + expr + ')';
      }
      return expr;
    }
    const expression = gen(maxDepth, []);
    const length = expression.length;
    const insideBand = length >= minChars && length <= maxChars;
    const distance = Math.abs(length - targetChars);
    let score = distance;
    if (insideBand) score -= Math.floor(targetChars * 0.12);
    if (length > maxChars) score += Math.floor((length - maxChars) * 0.75);
    if (length < minChars) score += Math.floor((minChars - length) * 0.35);
    const candidate = { expression, score };
    if (best === null || candidate.score < best.score) best = candidate;
    if (insideBand && distance <= targetChars * 0.06) return candidate.expression;
  }
  return best.expression;
}

// Closed terms generated above never reference predefined names, so a
// match against the answer must be a direct α-equivalence on the literal
// expression. `accepts` carries just that string.
function buildGeneratedPuzzle(expression, difficulty) {
  return {
    name: 'random λ-expression',
    expr: expression,
    difficulty: Math.min(10, difficulty),
    accepts: [expression],
    generated: true,
  };
}
function loadDailyState() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return { lastSolved: null, streak: 0, bestStreak: 0, history: {} };
    return Object.assign({ lastSolved: null, streak: 0, bestStreak: 0, history: {} }, JSON.parse(raw));
  } catch { return { lastSolved: null, streak: 0, bestStreak: 0, history: {} }; }
}
function saveDailyState(s) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); } catch {}
}
// Record the daily-puzzle solve for `dateKey`. If solved on the same
// day the puzzle was released → 'on-time'; otherwise → 'late'. Once
// 'on-time' is set for a date it can't be downgraded by a later
// re-solve. Used by the calendar mode to colour each date cell.
function recordDailySolve(dateKey) {
  const ds = loadDailyState();
  ds.history = ds.history || {};
  const today = todayKey();
  const status = (dateKey === today) ? 'on-time' : 'late';
  if (ds.history[dateKey] !== 'on-time') ds.history[dateKey] = status;
  saveDailyState(ds);
}

// ── Generators ─────────────────────────────────────────────────
// Daily uses the date as the RNG seed and runs the closed-term generator
// at depth 10 in "deep" shape. The result is a wholly random closed
// λ-expression — no recycling from PUZZLES — so two different dates can
// never produce the same daily.
const DAILY_DEPTH = 10;
function generateDailyPuzzle(dateKey) {
  const rng = dailyRng(dateKey);
  const expr = generateClosedLambdaExpression(rng, DAILY_DEPTH, 'deep');
  return buildGeneratedPuzzle(expr, 10);
}

// Generate a normal-mode puzzle whose difficulty matches `target`. At
// 1–6 stars we draw from the hand-curated PUZZLES pool (named
// combinators read better). At ≥7 stars we generate a random closed
// term scaled to the difficulty so the player can't memorise a small
// finite catalogue of answers.
function generateForDifficulty(targetDiff) {
  if (targetDiff >= 7) {
    // depth scales with difficulty: 7→6, 8→7, 9→8, 10→9. Difficulty 10
    // is handled by generateExtremePuzzle (depth 10).
    const depth = Math.max(6, Math.min(9, targetDiff - 1));
    const shape = targetDiff >= 9 ? 'deep' : 'mixed';
    const expr = generateClosedLambdaExpression(Math.random, depth, shape);
    return buildGeneratedPuzzle(expr, targetDiff);
  }
  const candidates = PUZZLES.filter(p => Math.abs(p.difficulty - targetDiff) <= 1);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  // Final fallback — short composition of named combinators.
  const len = Math.max(2, Math.min(4, Math.round(targetDiff / 2.5)));
  const fns = targetDiff <= 4 ? ['succ', 'pred'] : ['succ', 'pred', 'not'];
  let body = 'x';
  const used = [];
  for (let i = 0; i < len; i++) {
    const f = fns[Math.floor(Math.random() * fns.length)];
    used.push(f);
    body = f + ' (' + body + ')';
  }
  const expr = '\\x. ' + body;
  return {
    name: used.reverse().join(' ∘ '),
    expr,
    difficulty: targetDiff,
    accepts: [expr],
  };
}

function generateExtremePuzzle() {
  // 50/50 between a hand-curated EXTREME_POOL pick and a depth-10
  // random closed term. Pure-random keeps memorisation off the table;
  // the named picks still show up because they're the canonical
  // "look at this monstrosity" examples (Z, pred, eq, …).
  if (Math.random() < 0.5) {
    return Object.assign({ difficulty: 10 }, EXTREME_POOL[Math.floor(Math.random() * EXTREME_POOL.length)]);
  }
  const expr = generateClosedLambdaExpression(Math.random, DAILY_DEPTH, 'deep');
  return buildGeneratedPuzzle(expr, 10);
}

// ── Difficulty progression ─────────────────────────────────────
// Returns the level descriptor for the player's Nth solved level,
// taking the chosen game-difficulty into account.
function levelDescriptorFor(gameDiff, levelNum) {
  const cfg = GAME_DIFF_CFG[gameDiff];
  if (!cfg) return { difficulty: 1, extreme: false };
  if (gameDiff === 'extreme') return { difficulty: 10, extreme: true };
  const target = Math.max(1, Math.min(cfg.cap, Math.floor(cfg.base + levelNum * cfg.rate)));
  // Extreme spike — only hard & only after a few levels.
  if (gameDiff === 'hard' && levelNum >= 5 && Math.random() < cfg.extremeChance) {
    return { difficulty: 10, extreme: true };
  }
  return { difficulty: target, extreme: false };
}

// Pull the next normal-mode puzzle, respecting:
//   • the current level's difficulty target (and extreme flag);
//   • no-reuse of target text or function names across the run.
function nextNormalPuzzle() {
  const desc = levelDescriptorFor(playState.gameDifficulty, playState.level);
  for (let attempt = 0; attempt < 80; attempt++) {
    const p = desc.extreme ? generateExtremePuzzle() : generateForDifficulty(desc.difficulty);
    if (!p) continue;
    const targetKey = puzzleTargetKey(p);
    if (playState.usedTargets.has(targetKey)) continue;
    const fns = puzzleFunctionNames(p);
    let collision = false;
    for (const f of fns) if (playState.usedFns.has(f)) { collision = true; break; }
    if (collision) continue;
    playState.usedTargets.add(targetKey);
    fns.forEach(f => playState.usedFns.add(f));
    playState.levelDifficulty = desc.difficulty;
    playState.levelExtreme = desc.extreme;
    return p;
  }
  return null;
}
function puzzleTargetKey(p) { return (p.expr || '').replace(/\s+/g, ' ').trim(); }
function puzzleFunctionNames(p) {
  const names = new Set();
  const matches = (p.expr || '').match(/[a-zA-Z][a-zA-Z0-9_']*/g) || [];
  let defs = {};
  try { defs = allDefs(); } catch {}
  for (const m of matches) if (defs[m]) names.add(m);
  return names;
}

// ── Mode selection / pre-game ──────────────────────────────────
const DEFAULT_PLACEHOLDER = 'enter expression... (e.g. \\x. x or I)';

function clearPlayFeedback() {
  const fb = document.getElementById('playFeedback');
  if (!fb) return;
  fb.textContent = '';
  fb.className = 'play-feedback';
}

function resetModePuzzleState() {
  // These holders are mutually exclusive. Leaving one behind is exactly
  // what made later modes keep using the wrong level/puzzle.
  playState.randomPuzzle = null;
  playState.dailyPuzzle = null;
  playState.dailyDateKey = null;
  playState.usedTargets = null;
  playState.usedFns = null;
  playState.levelDifficulty = 1;
  playState.levelExtreme = false;
  // Per-run progress carried over between modes was causing stale
  // best-streaks / score numbers to flash on the new mode's status
  // line before the first puzzle drew. Wipe it on every mode change;
  // startSelectedRun() rewrites the same fields when a run begins.
  playState.level = 0;
  playState.score = 0;
  playState.hintsUsed = 0;
  playState.skipsUsed = 0;
  playState.attempts = 0;
  playState.hintLevel = 0;
  playState.givenUp = false;
  playState.colorThisRound = false;
  PLAY_COLOR_ON = false;
  syncColorButton();
}

function stopSpeedrunTimer() {
  if (speedrunInterval) {
    clearInterval(speedrunInterval);
    speedrunInterval = null;
  }
}

function setMode(name, opts) {
  opts = opts || {};
  // Invalidate any delayed advance/transition from the previous mode.
  playState.runToken++;
  // Reset placeholder and feedback before any mode handler runs.
  const input = document.getElementById('playInput');
  if (input) {
    input.setAttribute('placeholder', DEFAULT_PLACEHOLDER);
    input.value = '';
  }
  clearPlayFeedback();
  resetModePuzzleState();
  hideAbandonModals();
  hideEndgameModal();
  closeDailySolved();
  // Daily strips assistance: no hint, no skip, no reveal, no abandon.
  // The whole point is the date-stamped streak, so escape hatches are off.
  refreshActionBarForMode(name);
  // Restart button is part of the abandon-back flow only — hide it
  // on any fresh mode entry.
  const restartBtn = document.getElementById('playRestartBtn');
  if (restartBtn) restartBtn.hidden = true;
  // Mode-button highlight + chip text.
  document.querySelectorAll('.play-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === name);
  });
  const chipLabels = { normal: 'Normal mode', daily: 'Daily mode',
                       calendar: 'Calendar — past dailies', speedrun: 'Speedrun mode' };
  setChip(chipLabels[name] || (name + ' mode'));
  // Speedrun keeps an interval; always stop it before changing modes.
  stopSpeedrunTimer();
  // Calendar replaces the previous Reverse mode. The calendar grid
  // takes over the diagram zone; clicking a date sets up the daily
  // for that date and switches us into Daily mode.
  if (name === 'calendar') {
    playState.mode = 'calendar';
    playState.phase = 'idle';
    showPregame(false);
    setLockedState(false);
    showCounters(false);
    setStatus({
      label: 'Calendar — pick a past daily',
      score: 0,
      bestText: bestSummaryFor('daily'),
    });
    renderStars(0, false);
    setProgress(0);
    // Default landing month is today's, not the project epoch. The
    // epoch acts only as a lower bound on prev-arrow navigation.
    const now = new Date();
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    showCalendar(true);
    renderCalendar();
    return;
  }
  showCalendar(false);
  // Daily skips the pregame overlay entirely — picking the mode IS
  // the start signal. No difficulty picker (the date determines it),
  // no Start button. Drop straight onto the puzzle. The date defaults
  // to today, but the calendar caller can pass a past date via
  // `opts.dateKey`.
  if (name === 'daily') {
    playState.mode = 'daily';
    playState.dailyDateKey = opts.dateKey || todayKey();
    setStatus({
      label: 'Daily — ' + playState.dailyDateKey,
      score: 0,
      bestText: bestSummaryFor('daily'),
    });
    renderStars(0, false);
    setProgress(0);
    showPregame(false);
    setLockedState(false);
    startSelectedRun();
    return;
  }
  // For the other three modes, enter pre-game: blur the diagram and
  // show the difficulty card (Daily skips the picker).
  playState.mode = name;
  playState.phase = 'pregame';
  // Reset the visible status header so the player isn't reading a
  // stale puzzle's score/level while picking difficulty.
  setStatus({
    label: name === 'daily' ? 'Daily — pick when ready' :
           name === 'speedrun' ? 'Speedrun — pick a difficulty' :
                                 'Normal — pick a difficulty',
    score: 0,
    bestText: bestSummaryFor(name, playState.gameDifficulty),
  });
  renderStars(0, false);
  setProgress(0);
  showPregame(true, name);
  setLockedState(false);
  showCounters(false);
}

// Per-difficulty blurbs — only the selected one's text shows on the
// pregame card. Spec said "info on difficulty choice should only
// display info for the selected difficulty"; the previous wording
// was a one-liner spanning all four, which made the relevant bit
// hard to spot.
const DIFF_BLURBS = {
  easy:    'Easy — gentle ramp. Levels stay between 1 and 4 stars. 3 skips, 10 hints.',
  medium:  'Medium — moderate ramp. Levels grow up to 6 stars. 3 skips, 10 hints.',
  hard:    'Hard — steep ramp. Levels grow up to 9 stars and a 10-star extreme can spike in late. 3 skips, 10 hints.',
  extreme: 'Extreme — every level is a 10-star extreme. No skips, 10 hints.',
};
const SPEEDRUN_BLURBS = {
  easy:    'Easy — 15 fixed puzzles, mostly 1–3 stars. Race the clock; no hints, no skips.',
  medium:  'Medium — 15 fixed puzzles, 4–5 stars. Race the clock; no hints, no skips.',
  hard:    'Hard — 15 fixed puzzles, 6–7 stars. Race the clock; no hints, no skips.',
  extreme: 'Extreme — 15 fixed puzzles, 8–10 stars. Race the clock; no hints, no skips.',
};
function setGameDifficulty(diff) {
  if (!GAME_DIFF_CFG[diff]) return;
  playState.gameDifficulty = diff;
  document.querySelectorAll('.play-diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
  const blurb = document.getElementById('playPregameBlurb');
  if (blurb && playState.mode !== 'daily') {
    const map = playState.mode === 'speedrun' ? SPEEDRUN_BLURBS : DIFF_BLURBS;
    blurb.textContent = map[diff] || '';
  }
  // Refresh the best-summary chip in the status row (so the player
  // sees the relevant per-difficulty best while still on the picker).
  setStatus({
    label: playState.mode === 'speedrun' ? 'Speedrun — pick a difficulty' : 'Normal — pick a difficulty',
    score: 0,
    bestText: bestSummaryFor(playState.mode, diff),
  });
}

// "Start" button → actual run begins.
function startSelectedRun() {
  const mode = playState.mode;
  if (!mode) return;
  const selectedDailyDateKey = playState.dailyDateKey;
  playState.runToken++;
  showPregame(false);
  resetModePuzzleState();
  if (mode === 'daily') playState.dailyDateKey = selectedDailyDateKey || todayKey();
  // Reset run-scoped state.
  playState.phase = 'playing';
  playState.level = 0;
  playState.score = 0;
  playState.hintsUsed = 0;
  playState.skipsUsed = 0;
  playState.colorThisRound = false;
  playState.attempts = 0;
  playState.hintLevel = 0;
  playState.givenUp = false;
  playState.runStartTime = performance.now();
  playState.usedTargets = new Set();
  playState.usedFns = new Set();
  PLAY_COLOR_ON = false;
  syncColorButton();
  setLockedState(false);

  if (mode === 'daily') {
    // Calendar mode parks the chosen date on playState.dailyDateKey
    // before flipping us into 'daily'; default to today otherwise.
    const dateKey = playState.dailyDateKey || todayKey();
    playState.dailyDateKey = dateKey;
    playState.dailyPuzzle = generateDailyPuzzle(dateKey);
    playState.randomPuzzle = null;
    showCounters(false);
    applyCurrentPuzzle();
    const ds = loadDailyState();
    const isToday = dateKey === todayKey();
    const already = (ds.history && ds.history[dateKey]);
    // The status label already carries the date, so the feedback only
    // needs to convey *progress* (already solved / today / past).
    feedback(
      already ? 'Already solved (' + already + ').' :
                (isToday ? 'Solve to keep your streak going.' : 'Past daily — replay for fun.'),
      'hint');
    return;
  }

  if (mode === 'speedrun') {
    playState.randomPuzzle = null;
    playState.dailyPuzzle = null;
    speedrunStart = performance.now();
    stopSpeedrunTimer();
    speedrunInterval = setInterval(updateSpeedrunDisplay, 200);
    showCounters(false); // speedrun has neither hints nor skips
    applyCurrentPuzzle();
    return;
  }

  // mode === 'normal'
  const first = nextNormalPuzzle();
  if (!first) {
    feedback('Couldn\'t generate a starting puzzle. Try a different difficulty.', 'bad');
    return;
  }
  playState.randomPuzzle = first;
  playState.dailyPuzzle = null;
  showCounters(true);
  refreshCounters();
  applyCurrentPuzzle();
}

// ── Pre-game / locked-state helpers ────────────────────────────
function showPregame(visible, mode) {
  const pre = document.getElementById('playPregame');
  const zone = document.querySelector('.play-diagram-zone');
  if (zone) zone.classList.toggle('pregame', !!visible);
  if (!pre) return;
  pre.hidden = !visible;
  if (!visible) return;
  // Daily hides the difficulty picker; normal/speedrun show it.
  const diff = document.getElementById('playPregameDiff');
  const blurb = document.getElementById('playPregameBlurb');
  const title = document.getElementById('playPregameTitle');
  if (mode === 'daily') {
    if (title) title.textContent = 'Today\'s daily puzzle';
    if (diff) diff.hidden = true;
    if (blurb) blurb.textContent = 'One harder puzzle per day. Same for everyone, derived from the date.';
  } else if (mode === 'speedrun') {
    if (title) title.textContent = 'Pick a difficulty';
    if (diff) diff.hidden = false;
    if (blurb) blurb.textContent = SPEEDRUN_BLURBS[playState.gameDifficulty] || SPEEDRUN_BLURBS.easy;
  } else {
    if (title) title.textContent = 'Pick a difficulty';
    if (diff) diff.hidden = false;
    if (blurb) blurb.textContent = DIFF_BLURBS[playState.gameDifficulty] || DIFF_BLURBS.easy;
  }
}

function setLockedState(locked) {
  const frame = document.getElementById('playFrame');
  if (frame) frame.classList.toggle('play-locked', !!locked);
}

function showCounters(visible) {
  const c = document.getElementById('playCounters');
  if (c) c.hidden = !visible;
}

function refreshActionBarForMode(mode) {
  // Daily strips every escape hatch (the point is the date-stamped
  // streak). Speedrun strips Hint / Skip / Reveal because they're all
  // dead-ends — Reveal in particular locked the player out with no way
  // forward except Abandon, which read as a bug. Abandon stays visible
  // in speedrun so the player can still bail out. The colour toggle is
  // purely cosmetic, kept available everywhere except speedrun (where
  // it just feedback("No colour hint in speedrun.")).
  const isDaily = mode === 'daily';
  const isSpeedrun = mode === 'speedrun';
  const hide = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !!on; };
  hide('playHintBtn',    isDaily || isSpeedrun);
  hide('playSkipBtn',    isDaily || isSpeedrun);
  hide('playColorBtn',   isSpeedrun);
  hide('playRevealBtn',  isDaily || isSpeedrun);
  hide('playAbandonBtn', isDaily);
}
function refreshCounters() {
  const hl = document.getElementById('playHintsLeft');
  const sl = document.getElementById('playSkipsLeft');
  const cs = document.getElementById('playColorState');
  if (hl) hl.textContent = 'Hints: ' + (10 - playState.hintsUsed) + '/10';
  const skipsAllowed = (GAME_DIFF_CFG[playState.gameDifficulty] || {}).skipsAllowed || 0;
  if (sl) sl.textContent = 'Skips: ' + Math.max(0, skipsAllowed - playState.skipsUsed) + '/' + skipsAllowed;
  if (cs) cs.hidden = !playState.colorThisRound;
}

// ── Status / chip / stars / progress helpers ───────────────────
function setStatus({ label, score, bestText }) {
  const el = document.getElementById('puzzleNum');
  if (el && label != null) el.textContent = label;
  const sc = document.getElementById('playScore');
  const be = document.getElementById('playBest');
  // Score "Score: N" only applies to normal mode.
  //   • daily   — hidden entirely; streak goes in the solved overlay
  //   • speedrun — element is hijacked by the wall-clock timer
  //     (updateSpeedrunDisplay), so writing "Score: N" here would
  //     flicker over the timer between ticks. Don't touch it.
  const mode = playState.mode;
  if (sc) {
    sc.hidden = (mode === 'daily');
    if (mode === 'normal' && score != null) sc.textContent = 'Score: ' + score;
  }
  if (be) {
    be.hidden = (mode === 'daily');
    if (mode !== 'daily' && bestText != null) be.textContent = bestText;
  }
}
function setChip(text) {
  const el = document.getElementById('playModeChip');
  if (el) el.textContent = text;
}
// Friendly label for a difficulty score 0–10. Used as a tooltip on the
// star strip so players don't have to count the pips.
const DIFF_STAR_LABELS = [
  'no rating',
  'trivial', 'very easy', 'easy', 'easy+',
  'medium', 'medium+', 'hard', 'hard+',
  'very hard', 'extreme',
];
function renderStars(diff, extreme) {
  const el = document.getElementById('puzzleDiff');
  if (!el) return;
  el.innerHTML = '';
  el.classList.toggle('extreme', !!extreme);
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.className = i < diff ? 'star filled' : 'star hollow';
    s.textContent = i < diff ? '★' : '☆';
    el.appendChild(s);
  }
  // Tooltip — uses the existing .tt[data-tt] system in theme.css.
  if (diff <= 0) {
    el.classList.remove('tt');
    el.removeAttribute('data-tt');
  } else {
    const label = DIFF_STAR_LABELS[Math.min(10, Math.max(0, diff))];
    el.classList.add('tt');
    el.setAttribute('data-tt', diff + '/10 — ' + (extreme ? 'extreme' : label));
  }
}
function setProgress(pct) {
  const el = document.getElementById('playProgressFill');
  if (el) el.style.width = pct + '%';
}
function bestSummaryFor(mode, diff) {
  if (!mode) return 'Best: —';
  if (mode === 'speedrun') {
    const t = getSpeedrunBest(diff);
    return t == null ? 'Best: No completed run' : 'Best: ' + t.toFixed(1) + 's';
  }
  if (mode === 'daily') {
    const ds = loadDailyState();
    return ds.bestStreak ? 'Streak best: ' + ds.bestStreak : 'Streak best: —';
  }
  // normal
  const b = getBest('normal', diff);
  return b ? 'Best: ' + b.score + ' (streak ' + b.streak + ')' : 'Best: —';
}

// ── Current puzzle accessor ────────────────────────────────────
function currentPuzzle() {
  if (playState.mode === 'daily') return playState.dailyPuzzle || null;
  if (playState.mode === 'normal') return playState.randomPuzzle || null;
  if (playState.mode === 'speedrun') {
    const lvls = SPEEDRUN_LEVELS[playState.gameDifficulty] || [];
    return lvls[playState.level] || null;
  }
  return null;
}

// Transition between puzzles with the existing fade-out/fade-in
// classes — keeps the diagram swap visually obvious instead of
// snapping. `instant` skips the fade (used on the very first puzzle
// of a run, where there's nothing to fade out from).
function transitionToNextPuzzle(instant) {
  const token = playState.runToken;
  const dia = document.getElementById('playDiagramWrap');
  if (instant || !dia) {
    if (token === playState.runToken) applyCurrentPuzzle();
    return;
  }
  dia.classList.add('puzzle-out');
  setTimeout(() => {
    if (token !== playState.runToken) {
      dia.classList.remove('puzzle-out');
      return;
    }
    dia.classList.remove('puzzle-out');
    applyCurrentPuzzle();
    dia.classList.add('puzzle-in');
    setTimeout(() => {
      if (token === playState.runToken) dia.classList.remove('puzzle-in');
    }, 350);
  }, 280);
}

// ── Render the active puzzle ───────────────────────────────────
function applyCurrentPuzzle() {
  const p = currentPuzzle();
  if (!p) return;
  playState.levelStartTime = performance.now();
  playState.attempts = 0;
  playState.hintLevel = 0;
  playState.givenUp = false;
  playState.colorThisRound = false;
  refreshCounters();
  setLockedState(false);

  // Render diagram.
  try {
    const ast = elaborate(parse(p.expr), allDefs());
    SCALE = 16;
    COLOR_MODE = PLAY_COLOR_ON;
    ANIM_ENABLED = false;
    renderDiagram(ast, 0, null, {
      svgId: 'playSVG', segsId: 'playSegs', zonesId: 'playZones',
      skipRedexZones: true,
    });
    const svg = document.getElementById('playSVG');
    if (svg) {
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h && parseFloat(w) > 0) {
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    }
  } catch (e) { console.error('Puzzle render failed:', e); }

  // Status header label depends on mode.
  let label;
  const mode = playState.mode;
  if (mode === 'daily') label = 'Daily — ' + (playState.dailyDateKey || todayKey());
  else if (mode === 'speedrun') {
    const total = (SPEEDRUN_LEVELS[playState.gameDifficulty] || []).length;
    label = 'Speedrun ' + (playState.level + 1) + ' / ' + total +
            ' (' + (GAME_DIFF_CFG[playState.gameDifficulty] || {}).label + ')';
  }
  else label = 'Normal · #' + (playState.level + 1) +
               ' (' + (GAME_DIFF_CFG[playState.gameDifficulty] || {}).label + ')';

  // Stars: in normal mode reflect the level descriptor; in speedrun
  // and daily, reflect the puzzle's own difficulty (capped at 10).
  let diff, extreme;
  if (mode === 'normal') {
    diff = playState.levelDifficulty;
    extreme = !!playState.levelExtreme;
  } else {
    diff = Math.min(10, p.difficulty || 1);
    extreme = (p.difficulty || 0) >= 10;
  }
  renderStars(diff, extreme);

  setStatus({
    label,
    score: playState.score,
    bestText: bestSummaryFor(mode, playState.gameDifficulty),
  });

  // Progress bar:
  if (mode === 'speedrun') {
    const total = (SPEEDRUN_LEVELS[playState.gameDifficulty] || []).length;
    setProgress((playState.level / total) * 100);
  } else if (mode === 'daily') {
    setProgress(0);
  } else {
    // Normal mode is open-ended; show a soft growth toward "20 levels"
    // as a visual breadcrumb without implying a hard cap.
    setProgress(Math.min(100, (playState.level / 20) * 100));
  }

  // Reset input + feedback.
  const input = document.getElementById('playInput');
  if (input) { input.value = ''; input.focus(); }
  clearPlayFeedback();
}

// ── Scoring ────────────────────────────────────────────────────
function computeScore(levelDiff, elapsedSec, attempts, colorApplied) {
  const base = levelDiff * 8;
  const speedBonus = Math.max(0, Math.round(15 - elapsedSec));
  const attemptPenalty = Math.max(0, attempts - 1) * 3;
  let earned = Math.max(2, base + speedBonus - attemptPenalty);
  if (colorApplied) earned = Math.max(1, Math.floor(earned / 2));
  return earned;
}

// ── Stats persistence (long-running) ───────────────────────────
const STATS_KEY = 'tromp_play_stats';
let playStats = { solved: 0, streak: 0, bestStreak: 0 };
function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') Object.assign(playStats, s);
  } catch {}
}
function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(playStats)); } catch {}
}

// ── Submit answer ──────────────────────────────────────────────
function checkAnswer() {
  if (playState.phase !== 'playing') return;
  if (playState.givenUp) return;

  const input = document.getElementById('playInput').value.trim();
  if (!input) return;
  playState.attempts++;
  const p = currentPuzzle();
  if (!p) return;
  let userAst;
  try { userAst = elaborate(parse(input), allDefs()); }
  catch (e) { feedback('Parse error: ' + e.message, 'bad'); shakeInput(); return; }
  const targetAst = elaborate(parse(p.expr), allDefs());
  if (!alphaEqual(userAst, targetAst)) {
    feedback('✗ Not quite — keep trying.', 'bad');
    shakeInput();
    return;
  }

  // Correct.
  const elapsed = (performance.now() - playState.levelStartTime) / 1000;
  // Score only exists for normal mode. Daily uses the streak; speedrun
  // uses the wall-clock time. Computing/awarding points for the other
  // two would just add a misleading number to the feedback line.
  const earned = (playState.mode === 'normal')
    ? computeScore(playState.levelDifficulty, elapsed, playState.attempts, playState.colorThisRound)
    : 0;
  if (playState.mode === 'normal') playState.score += earned;
  playState.level += 1;
  playStats.solved++;
  playStats.streak++;
  if (playStats.streak > playStats.bestStreak) playStats.bestStreak = playStats.streak;
  saveStats();

  const attemptsTxt = playState.attempts + ' attempt' + (playState.attempts === 1 ? '' : 's');
  let msg;
  if (playState.mode === 'normal') {
    msg = '✓ Correct! +' + earned + ' pts (' + elapsed.toFixed(1) + 's, ' + attemptsTxt + ')';
    if (playState.colorThisRound) msg += ' · colour-halved';
  } else {
    msg = '✓ Correct! (' + elapsed.toFixed(1) + 's, ' + attemptsTxt + ')';
  }
  // Daily: record the per-date solve in history (on-time vs late) and
  // — only when it's actually today's puzzle — bump the streak the
  // first time the player completes it.
  if (playState.mode === 'daily') {
    const dateKey = playState.dailyDateKey || todayKey();
    recordDailySolve(dateKey);
    const today = todayKey();
    const ds = loadDailyState();
    if (dateKey === today && ds.lastSolved !== today) {
      const yesterday = (() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      })();
      ds.streak = (ds.lastSolved === yesterday) ? ds.streak + 1 : 1;
      ds.lastSolved = today;
      if (ds.streak > ds.bestStreak) ds.bestStreak = ds.streak;
      saveDailyState(ds);
      msg += '  ·  daily streak: ' + ds.streak;
    } else if (dateKey === today) {
      msg += '  ·  already solved today';
    } else {
      msg += '  ·  past daily marked solved';
    }
  }
  feedback(msg, 'ok');
  flashSuccess();

  // Per-difficulty bests are only meaningful for normal mode (speedrun
  // tracks completion time via setSpeedrunBest, daily tracks streak).
  if (playState.mode === 'normal') {
    bumpRunBest(playState.mode, playState.gameDifficulty, playState.score, playState.level);
  }

  advanceAfterSolve();
}

// ── Advance after solve ────────────────────────────────────────
function advanceAfterSolve() {
  const mode = playState.mode;
  const token = playState.runToken;
  if (mode === 'daily') {
    // Daily is one-and-done. Instead of the global endgame popup,
    // show an inline overlay on the diagram (which gets blurred behind
    // it, same look as the pre-game card). Carries date + Solved! +
    // streak / best streak.
    setTimeout(() => {
      if (token === playState.runToken && playState.mode === mode) showDailySolvedOverlay();
    }, 800);
    return;
  }
  if (mode === 'speedrun') {
    setTimeout(() => {
      if (token !== playState.runToken || playState.mode !== mode) return;
      const total = (SPEEDRUN_LEVELS[playState.gameDifficulty] || []).length;
      if (playState.level >= total) {
        const seconds = (performance.now() - speedrunStart) / 1000;
        stopSpeedrunTimer();
        setSpeedrunBest(playState.gameDifficulty, seconds);
        endRunPopup({
          title: 'Speedrun complete',
          subtitle: 'All 15 cleared in ' + seconds.toFixed(1) + 's.',
          lines: [
            ['Time',     seconds.toFixed(1) + 's'],
            ['Best',     (getSpeedrunBest(playState.gameDifficulty) || seconds).toFixed(1) + 's'],
          ],
        });
        return;
      }
      transitionToNextPuzzle();
    }, 900);
    return;
  }
  if (mode === 'normal') {
    setTimeout(() => {
      if (token !== playState.runToken || playState.mode !== mode) return;
      const next = nextNormalPuzzle();
      if (!next) {
        endRunPopup({
          title: 'Out of fresh puzzles',
          subtitle: 'You\'ve used every available combination this run.',
          lines: outOfPuzzlesLines(),
        });
        return;
      }
      playState.randomPuzzle = next;
      transitionToNextPuzzle();
    }, 1200);
    return;
  }
}

function outOfPuzzlesLines() {
  const b = getBest('normal', playState.gameDifficulty) || { score: 0, streak: 0 };
  return [
    ['Score',     playState.score],
    ['Best score', b.score],
    ['Streak',    playState.level],
    ['Best streak', b.streak],
  ];
}

// ── Hints / colour / skip / reveal ─────────────────────────────
function showHint() {
  if (playState.phase !== 'playing' || playState.givenUp) return;
  if (playState.mode === 'speedrun') {
    feedback('No hints in speedrun.', 'bad');
    return;
  }
  if (playState.hintsUsed >= 10) {
    feedback('Hint limit reached (10 / 10).', 'bad');
    return;
  }
  const p = currentPuzzle();
  if (!p) return;
  let lambdas = 0, apps = 0;
  try {
    const ast = elaborate(parse(p.expr), allDefs());
    (function walk(n) {
      if (n.t === 'lam') { lambdas++; walk(n.b); }
      else if (n.t === 'app') { apps++; walk(n.f); walk(n.a); }
    })(ast);
  } catch {}
  playState.hintLevel++;
  playState.hintsUsed++;
  refreshCounters();
  let msg;
  if (playState.hintLevel === 1) {
    msg = 'Hint ' + playState.hintsUsed + '/10: ' +
          lambdas + ' λ binder' + (lambdas === 1 ? '' : 's') +
          ', ' + apps + ' application' + (apps === 1 ? '' : 's') + '.';
  } else if (playState.hintLevel === 2) {
    msg = 'Hint ' + playState.hintsUsed + '/10: starts with "' + p.expr.slice(0, 6).replace(/\\/g, 'λ') + '…"';
  } else if (playState.hintLevel === 3) {
    msg = 'Hint ' + playState.hintsUsed + '/10: name begins with "' + p.name[0] + '"';
  } else {
    msg = 'Hint used ' + playState.hintsUsed + '/10, no new info this round — try Reveal.';
  }
  feedback(msg, 'hint');
}

function togglePlayColor() {
  if (playState.phase !== 'playing' || playState.givenUp) return;
  if (playState.mode === 'speedrun') {
    feedback('No colour hint in speedrun.', 'bad');
    return;
  }
  PLAY_COLOR_ON = !PLAY_COLOR_ON;
  // First time the player turns colour on this round, mark the round
  // as colour-halved (irreversible until next puzzle).
  if (PLAY_COLOR_ON) playState.colorThisRound = true;
  rerenderCurrentDiagram();
  syncColorButton();
  refreshCounters();
}

function syncColorButton() {
  const btn = document.getElementById('playColorBtn');
  if (!btn) return;
  btn.classList.toggle('active', PLAY_COLOR_ON);
  btn.textContent = PLAY_COLOR_ON ? '🎨 Color: ON' : '🎨 Color';
}

function rerenderCurrentDiagram() {
  const p = currentPuzzle();
  if (!p) return;
  try {
    const ast = elaborate(parse(p.expr), allDefs());
    SCALE = 16;
    COLOR_MODE = PLAY_COLOR_ON;
    ANIM_ENABLED = false;
    renderDiagram(ast, 0, null, {
      svgId: 'playSVG', segsId: 'playSegs', zonesId: 'playZones',
      skipRedexZones: true,
    });
    const svg = document.getElementById('playSVG');
    if (svg) {
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h && parseFloat(w) > 0) {
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    }
  } catch (e) { console.error(e); }
}

function skipPuzzle() {
  if (playState.phase !== 'playing') return;
  if (playState.mode === 'speedrun') {
    feedback('No skips in speedrun.', 'bad');
    return;
  }
  if (playState.mode === 'daily') {
    feedback('Daily can\'t be skipped — only solved or abandoned.', 'bad');
    return;
  }
  const skipsAllowed = (GAME_DIFF_CFG[playState.gameDifficulty] || {}).skipsAllowed || 0;
  if (playState.skipsUsed >= skipsAllowed) {
    feedback(skipsAllowed === 0 ? 'Extreme has no skips.' : 'Skip limit reached (' + skipsAllowed + '/' + skipsAllowed + ').', 'bad');
    return;
  }
  playState.skipsUsed++;
  playStats.streak = 0;
  saveStats();
  refreshCounters();
  // Skip in normal: pull a fresh puzzle without scoring; if exhausted,
  // end the run.
  if (playState.mode === 'normal') {
    const next = nextNormalPuzzle();
    if (!next) {
      endRunPopup({
        title: 'Out of fresh puzzles',
        subtitle: 'No more unique combinations available this run.',
        lines: outOfPuzzlesLines(),
      });
      return;
    }
    playState.randomPuzzle = next;
    transitionToNextPuzzle();
  }
}

function giveUp() {
  if (playState.phase !== 'playing') return;
  if (playState.givenUp) return;
  const p = currentPuzzle();
  if (!p) return;
  // Lock the input + Submit/Hint/Color/Reveal — only Abandon and Skip
  // remain clickable, per spec.
  playState.givenUp = true;
  setLockedState(true);
  feedback('Answer: ' + p.expr.replace(/\\/g, 'λ') +
           '   (also accepted: ' + (p.accepts || []).slice(0, 3).join(', ') + ')', 'hint');
  playStats.streak = 0;
  saveStats();
}

// ── Abandon flow + endgame popup ───────────────────────────────
function abandonRun() {
  if (playState.phase !== 'playing' && playState.phase !== 'revealed') {
    // Allow abandon during revealed/locked state too.
  }
  const m = document.getElementById('abandonConfirmModal');
  if (m) m.hidden = false;
}
function closeAbandonConfirm() {
  const m = document.getElementById('abandonConfirmModal');
  if (m) m.hidden = true;
}
function confirmAbandon() {
  closeAbandonConfirm();
  // Compute summary based on mode.
  if (playState.mode === 'speedrun') {
    const seconds = (performance.now() - speedrunStart) / 1000;
    stopSpeedrunTimer();
    const best = getSpeedrunBest(playState.gameDifficulty);
    const total = (SPEEDRUN_LEVELS[playState.gameDifficulty] || []).length;
    endRunPopup({
      title: 'Speedrun abandoned',
      subtitle: 'Reached ' + playState.level + ' / ' + total + ' before stopping.',
      lines: [
        ['Time',     seconds.toFixed(1) + 's'],
        ['Best',     best == null ? 'No completed run' : best.toFixed(1) + 's'],
        ['Levels',   playState.level + ' / ' + total],
      ],
    });
    return;
  }
  bumpRunBest(playState.mode, playState.gameDifficulty, playState.score, playState.level);
  const b = getBest(playState.mode, playState.gameDifficulty) || { score: 0, streak: 0 };
  endRunPopup({
    title: 'Run abandoned',
    subtitle: null,
    lines: [
      ['Score',      playState.score],
      ['Best score', b.score],
      ['Streak',     playState.level],
      ['Best streak', b.streak],
    ],
  });
}

function endRunPopup({ title, subtitle, lines }) {
  playState.runToken++;
  playState.phase = 'ended';
  setLockedState(false);
  const t = document.getElementById('endgameTitle');
  const s = document.getElementById('endgameSubtitle');
  const sc = document.getElementById('endgameScores');
  if (t) t.textContent = title || 'Run ended';
  if (s) {
    if (subtitle) { s.textContent = subtitle; s.hidden = false; }
    else s.hidden = true;
  }
  if (sc) {
    sc.innerHTML = '';
    for (const [label, value] of lines) {
      const div = document.createElement('div');
      div.innerHTML =
        '<span class="play-modal-label">' + label + '</span>' +
        '<b>' + value + '</b>';
      sc.appendChild(div);
    }
  }
  const m = document.getElementById('playEndgameModal');
  if (m) m.hidden = false;
}
function backFromEndgame() {
  const m = document.getElementById('playEndgameModal');
  if (m) m.hidden = true;
  // Leave the puzzle visible (still in 'ended' phase). Player can
  // start a fresh run via the now-visible Restart button or pick a
  // new mode from the bar.
  const r = document.getElementById('playRestartBtn');
  if (r) r.hidden = false;
}
function playAgainFromEndgame() {
  const m = document.getElementById('playEndgameModal');
  if (m) m.hidden = true;
  setMode(playState.mode || 'normal');
}
// Restart-after-abandon button — only visible after the player
// abandons and clicks "Back to puzzle". Restarts the same mode.
function restartAfterAbandon() {
  const r = document.getElementById('playRestartBtn');
  if (r) r.hidden = true;
  setMode(playState.mode || 'normal');
}
function hideAbandonModals() {
  const c = document.getElementById('abandonConfirmModal');
  if (c) c.hidden = true;
}
function hideEndgameModal() {
  const m = document.getElementById('playEndgameModal');
  if (m) m.hidden = true;
}

// ── Daily solved (inline overlay on the diagram) ───────────────
// Returns the emoji ladder for a given streak. Pure cosmetics.
//   3-6  = 🔥
//   7-13 = 🔥🔥
//   14-29 = 🔥🔥🔥
//   30+  = "λ master"
function streakEmoji(n) {
  if (n >= 30) return 'λ master';
  if (n >= 14) return '🔥🔥🔥';
  if (n >= 7)  return '🔥🔥';
  if (n >= 3)  return '🔥';
  return '';
}

// Live countdown to the next daily (00:00 local). Updated every second
// while the overlay is visible.
let dailyCountdownTimer = null;
function tickDailyCountdown() {
  const el = document.getElementById('playDailyCountdownVal');
  if (!el) return;
  const now = new Date();
  const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let s = Math.max(0, Math.floor((tmrw - now) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);   s -= m * 60;
  el.textContent =
    String(h).padStart(2, '0') + 'h ' +
    String(m).padStart(2, '0') + 'm ' +
    String(s).padStart(2, '0') + 's';
}

function showDailySolvedOverlay() {
  const ds = loadDailyState();
  const dateKey = playState.dailyDateKey || todayKey();
  const dEl = document.getElementById('playDailySolvedDate');
  const sEl = document.getElementById('playDailyStreak');
  const bEl = document.getElementById('playDailyBest');
  const eEl = document.getElementById('playDailyStreakEmoji');
  if (dEl) dEl.textContent = 'Daily — ' + dateKey;
  if (sEl) sEl.textContent = ds.streak || 0;
  if (bEl) bEl.textContent = ds.bestStreak || 0;
  if (eEl) {
    const tag = streakEmoji(ds.streak || 0);
    eEl.textContent = tag;
    eEl.style.display = tag ? '' : 'none';
  }
  const o = document.getElementById('playDailySolved');
  const zone = document.querySelector('.play-diagram-zone');
  if (zone) zone.classList.add('daily-solved');
  if (o) o.hidden = false;
  // Live next-puzzle countdown — only meaningful for today's daily, but
  // harmless to show on past replays too. Tick once now, then every 1s.
  tickDailyCountdown();
  if (dailyCountdownTimer) clearInterval(dailyCountdownTimer);
  dailyCountdownTimer = setInterval(tickDailyCountdown, 1000);
  // Confetti when a streak hits a multiple of 10 — only fire when the
  // solve was today's daily (you don't get confetti for backfills).
  if (dateKey === todayKey() && ds.streak && ds.streak % 10 === 0) {
    fireConfetti();
  }
  // Move into ended phase so the action-bar buttons are no-ops while
  // the overlay is visible (Hint / Skip / Reveal / Submit do nothing
  // when phase !== 'playing').
  playState.phase = 'ended';
}
function closeDailySolved() {
  const o = document.getElementById('playDailySolved');
  const zone = document.querySelector('.play-diagram-zone');
  if (zone) zone.classList.remove('daily-solved');
  if (o) o.hidden = true;
  if (dailyCountdownTimer) {
    clearInterval(dailyCountdownTimer);
    dailyCountdownTimer = null;
  }
}

// ── Confetti (10-streak) ───────────────────────────────────────
function fireConfetti() {
  // Honour reduced-motion — CSS hides .confetti-host but we shouldn't
  // even spawn the elements in that case.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let host = document.getElementById('confettiHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'confettiHost';
    host.className = 'confetti-host';
    document.body.appendChild(host);
  }
  const colors = ['#7aa2f7', '#bb9af7', '#9ece6a', '#f7768e', '#e0af68', '#7dcfff'];
  const N = 80;
  for (let i = 0; i < N; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * 100) + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    const dur = 2.4 + Math.random() * 2.0;
    piece.style.animationDuration = dur + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    piece.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
    host.appendChild(piece);
    setTimeout(() => piece.remove(), (dur + 0.6) * 1000);
  }
}

// ── Clear-data flow ────────────────────────────────────────────
// Wipes every key this page wrote to localStorage. Tracked here so
// adding a new key in future means updating this list — there's no
// programmatic "everything tagged play" enumeration.
const PLAY_STORAGE_KEYS = [
  BESTS_KEY,           // per-mode/per-difficulty bests + speedrun times
  DAILY_KEY,           // daily streak + history + lastSolved
  STATS_KEY,           // long-running solved/streak counters
  // Legacy keys from earlier versions, cleaned up too:
  'tromp_play_score',
  'tromp_play_best',
  'tromp_play_mode_best',
];
function openClearDataConfirm() {
  const m = document.getElementById('clearDataConfirmModal');
  if (m) m.hidden = false;
}
function closeClearDataConfirm() {
  const m = document.getElementById('clearDataConfirmModal');
  if (m) m.hidden = true;
}
function confirmClearData() {
  for (const k of PLAY_STORAGE_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
  // Reset in-memory mirrors so the UI reflects the wipe immediately.
  playStats = { solved: 0, streak: 0, bestStreak: 0 };
  closeClearDataConfirm();
  feedback('Play data cleared.', 'ok');
  // Drop the player back to the Normal pre-game so the freshly-zero'd
  // bests are visible on the status chip.
  setMode('normal');
}

// ── Export / import ────────────────────────────────────────────
// Progress lives in localStorage so it's per-browser. Export builds a
// portable JSON blob the user can save and re-import on a different
// machine; the format is versioned so we can migrate later.
const PLAY_EXPORT_VERSION = 1;
function exportPlayData() {
  const data = {};
  for (const k of PLAY_STORAGE_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    } catch {}
  }
  const blob = new Blob([JSON.stringify({
    site: 'tromp-diagrams',
    kind: 'play-progress',
    version: PLAY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tromp-play-progress-' + todayKey() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  feedback('Progress exported.', 'ok');
}

function importPlayData(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || parsed.site !== 'tromp-diagrams' || parsed.kind !== 'play-progress' || !parsed.data) {
        feedback('Import failed: not a Tromp progress file.', 'bad');
        return;
      }
      // Restrict writes to keys we actually own. Anything else is silently
      // dropped so a hand-edited file can't dump junk into the namespace.
      const allowed = new Set(PLAY_STORAGE_KEYS);
      let n = 0;
      for (const [k, v] of Object.entries(parsed.data)) {
        if (!allowed.has(k)) continue;
        try { localStorage.setItem(k, v); n++; } catch {}
      }
      // Refresh in-memory mirrors so the UI reflects the new state.
      try { playStats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch {}
      playStats = Object.assign({ solved: 0, streak: 0, bestStreak: 0 }, playStats || {});
      feedback('Imported ' + n + ' key' + (n === 1 ? '' : 's') + '. Reloading…', 'ok');
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      feedback('Import failed: ' + e.message, 'bad');
    }
  };
  reader.readAsText(file);
  // Reset the input so re-picking the same file fires onchange again.
  ev.target.value = '';
}

// ── Feedback / flash / shake ───────────────────────────────────
function feedback(msg, kind) {
  const el = document.getElementById('playFeedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'play-feedback ' + (kind || '');
}
function flashSuccess() {
  const dia = document.getElementById('playDiagramWrap');
  if (!dia) return;
  dia.classList.remove('flash-success');
  void dia.offsetWidth;
  dia.classList.add('flash-success');
  setTimeout(() => dia.classList.remove('flash-success'), 700);
}
function shakeInput() {
  const i = document.getElementById('playInput');
  if (!i) return;
  i.classList.remove('shake');
  void i.offsetWidth;
  i.classList.add('shake');
  setTimeout(() => i.classList.remove('shake'), 380);
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR — past dailies. Replaces the old REVERSE mode entirely.
//
// Renders a month grid; each cell is coloured by the per-date status
// in DAILY_KEY.history: 'on-time' (green), 'late' (yellow), today
// (blue accent), future (dim, disabled). Clicking a non-future cell
// stashes the date on playState.dailyDateKey and flips the player
// into Daily mode pre-game for that date.
// ═══════════════════════════════════════════════════════════════
let calMonth = null;  // first-of-month Date for the currently-shown grid

function showCalendar(visible) {
  const c = document.getElementById('playCalendar');
  if (c) c.hidden = !visible;
}
// January 2026 is the project's daily-mode epoch — there are no
// dailies before it, so the prev arrow is disabled when we're
// already showing that month.
const CAL_EPOCH = new Date(2026, 0, 1);
function calMoveMonth(delta) {
  if (!calMonth) {
    const now = new Date();
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const candidate = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  if (candidate < CAL_EPOCH) return; // clamped at the epoch
  calMonth = candidate;
  renderCalendar();
}
function dateKeyFor(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function renderCalendar() {
  if (!calMonth) {
    const now = new Date();
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const monthEl = document.getElementById('playCalMonth');
  const grid = document.getElementById('playCalGrid');
  if (!monthEl || !grid) return;
  const monthFmt = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  monthEl.textContent = monthFmt[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
  // Disable the prev arrow when we're on the epoch month — there's
  // no daily history before then, so navigating further has no point.
  const prevBtn = document.querySelector('.play-cal-nav');
  if (prevBtn) {
    const atEpoch = (calMonth.getFullYear() === CAL_EPOCH.getFullYear() &&
                     calMonth.getMonth() === CAL_EPOCH.getMonth());
    prevBtn.disabled = atEpoch;
    prevBtn.style.opacity = atEpoch ? '0.3' : '';
    prevBtn.style.cursor = atEpoch ? 'not-allowed' : '';
  }
  grid.innerHTML = '';
  // Monday-first: getDay() returns 0=Sun..6=Sat; we want Mo=0..Su=6.
  const firstDow = (calMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  const todayK = dateKeyFor(today);
  const ds = loadDailyState();
  const hist = ds.history || {};
  // Leading empty cells.
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'play-cal-cell empty';
    grid.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
    const key = dateKeyFor(date);
    const cell = document.createElement('div');
    cell.className = 'play-cal-cell';
    cell.textContent = String(d);
    const isFuture = date > today && key !== todayK;
    if (isFuture) cell.classList.add('future');
    else {
      const status = hist[key];
      if (status === 'on-time') cell.classList.add('ontime');
      else if (status === 'late') cell.classList.add('late');
      if (key === todayK) cell.classList.add('today');
      cell.addEventListener('click', () => playDailyForDate(key));
    }
    grid.appendChild(cell);
  }
}
function playDailyForDate(dateKey) {
  // Pass the chosen date explicitly through setMode — bare `setMode('daily')`
  // would override dailyDateKey to today.
  setMode('daily', { dateKey });
}

// ═══════════════════════════════════════════════════════════════
// SPEEDRUN — fixed 15-puzzle race, no hints / no skips.
// ═══════════════════════════════════════════════════════════════
let speedrunStart = 0;
let speedrunInterval = null;
function updateSpeedrunDisplay() {
  if (!playState.mode || playState.mode !== 'speedrun' || playState.phase !== 'playing') {
    stopSpeedrunTimer();
    return;
  }
  const elapsed = (performance.now() - speedrunStart) / 1000;
  const el = document.getElementById('playScore');
  if (el) el.textContent = '⏱ ' + elapsed.toFixed(1) + 's';
}

// ── Init ───────────────────────────────────────────────────────
function initPlay() {
  loadStats();
  const input = document.getElementById('playInput');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }
    });
  }
  document.addEventListener('keydown', e => {
    if (!e.altKey) return;
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); showHint(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); skipPuzzle(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); giveUp(); }
  });
  // Start in pre-game on Normal so the player sees the difficulty
  // picker as the first interactive surface.
  setMode('normal');
}
