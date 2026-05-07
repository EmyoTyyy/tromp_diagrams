// ═══════════════════════════════════════
// PLAY MODE — guess the expression from a Tromp diagram
// ═══════════════════════════════════════

// Puzzles ordered by approximate difficulty.
const PUZZLES = [
  // ── Tier 1: foundations ───────────────────────────────────
  { name: 'I',     expr: '\\x. x',                   difficulty: 1, accepts: ['I', '\\x. x', 'id'] },
  { name: 'K',     expr: '\\x. \\y. x',              difficulty: 1, accepts: ['K', '\\x. \\y. x', 'true', '\\x y. x'] },
  { name: 'false', expr: '\\x. \\y. y',              difficulty: 1, accepts: ['false', '\\x. \\y. y', '\\x y. y'] },
  { name: '0',     expr: '\\f. \\x. x',              difficulty: 1, accepts: ['0', 'false', '\\f. \\x. x'] },
  { name: '1',     expr: '\\f. \\x. f x',            difficulty: 2, accepts: ['1', '\\f. \\x. f x'] },
  { name: '2',     expr: '\\f. \\x. f (f x)',        difficulty: 2, accepts: ['2', '\\f. \\x. f (f x)'] },
  { name: '3',     expr: '\\f. \\x. f (f (f x))',    difficulty: 2, accepts: ['3', '\\f. \\x. f (f (f x))'] },

  // ── Tier 2: basic logic ───────────────────────────────────
  { name: 'not',   expr: '\\b. b false true',        difficulty: 3, accepts: ['not', '\\b. b false true'] },
  { name: 'and',   expr: '\\p. \\q. p q p',          difficulty: 3, accepts: ['and', '\\p. \\q. p q p'] },
  { name: 'or',    expr: '\\p. \\q. p p q',          difficulty: 3, accepts: ['or', '\\p. \\q. p p q'] },
  { name: 'if',    expr: '\\p. \\a. \\b. p a b',     difficulty: 3, accepts: ['if', '\\p. \\a. \\b. p a b'] },
  { name: 'pair (incomplete)', expr: '\\x. \\y. \\f. f x y', difficulty: 3, accepts: ['pair', '\\x. \\y. \\f. f x y'] },

  // ── Tier 3: combinators ───────────────────────────────────
  { name: 'B',     expr: '\\f. \\g. \\x. f (g x)',   difficulty: 3, accepts: ['B', '\\f. \\g. \\x. f (g x)'] },
  { name: '4',     expr: '\\f. \\x. f (f (f (f x)))', difficulty: 3, accepts: ['4', '\\f. \\x. f (f (f (f x)))'] },
  { name: 'C',     expr: '\\f. \\x. \\y. f y x',     difficulty: 4, accepts: ['C', '\\f. \\x. \\y. f y x'] },
  { name: 'W',     expr: '\\f. \\x. f x x',          difficulty: 4, accepts: ['W', '\\f. \\x. f x x'] },
  { name: 'S',     expr: '\\x. \\y. \\z. x z (y z)', difficulty: 4, accepts: ['S', '\\x. \\y. \\z. x z (y z)'] },
  { name: 'xor',   expr: '\\p. \\q. p (not q) q',    difficulty: 4, accepts: ['xor', '\\p. \\q. p (not q) q'] },
  { name: 'iszero', expr: '\\n. n (\\x. false) true', difficulty: 4, accepts: ['iszero', '\\n. n (\\x. false) true'] },

  // ── Tier 4: arithmetic ────────────────────────────────────
  { name: 'succ',  expr: '\\n. \\f. \\x. f (n f x)', difficulty: 5, accepts: ['succ', '\\n. \\f. \\x. f (n f x)'] },
  { name: 'plus',  expr: '\\m. \\n. \\f. \\x. m f (n f x)', difficulty: 5, accepts: ['plus', '\\m. \\n. \\f. \\x. m f (n f x)'] },
  { name: 'mult',  expr: '\\m. \\n. \\f. m (n f)',   difficulty: 5, accepts: ['mult', '\\m. \\n. \\f. m (n f)'] },
  { name: 'pow',   expr: '\\m. \\n. n m',            difficulty: 5, accepts: ['pow', '\\m. \\n. n m'] },

  // ── Tier 5: lists ─────────────────────────────────────────
  { name: 'nil',   expr: '\\c. \\n. n',              difficulty: 5, accepts: ['nil', '0', 'false', '\\c. \\n. n'] },
  { name: 'cons',  expr: '\\h. \\t. \\c. \\n. c h (t c n)', difficulty: 6, accepts: ['cons', '\\h. \\t. \\c. \\n. c h (t c n)'] },
  { name: 'isnil', expr: '\\l. l (\\h. \\t. false) true', difficulty: 6, accepts: ['isnil', '\\l. l (\\h. \\t. false) true'] },
  { name: 'length', expr: '\\l. l (\\h. \\r. succ r) 0', difficulty: 6, accepts: ['length', '\\l. l (\\h. \\r. succ r) 0'] },

  // ── Tier 6: harder arithmetic + comparisons ───────────────
  { name: 'sub',   expr: '\\m. \\n. n pred m',       difficulty: 6, accepts: ['sub', '\\m. \\n. n pred m'] },
  { name: 'leq',   expr: '\\m. \\n. iszero (sub m n)', difficulty: 7, accepts: ['leq', '\\m. \\n. iszero (sub m n)'] },
  { name: 'eq',    expr: '\\m. \\n. and (leq m n) (leq n m)', difficulty: 7, accepts: ['eq', '\\m. \\n. and (leq m n) (leq n m)'] },

  // ── Tier 7: fixed-point territory ─────────────────────────
  { name: 'omega', expr: '(\\x. x x) (\\x. x x)',    difficulty: 6, accepts: ['omega', '(\\x. x x) (\\x. x x)'] },
  { name: 'Y',     expr: '\\f. (\\x. f (x x)) (\\x. f (x x))', difficulty: 7, accepts: ['Y', '\\f. (\\x. f (x x)) (\\x. f (x x))'] },
  { name: 'Z',     expr: '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))', difficulty: 8, accepts: ['Z', '\\f. (\\x. f (\\v. x x v)) (\\x. f (\\v. x x v))'] },
  { name: 'pred',  expr: '\\n. \\f. \\x. n (\\g. \\h. h (g f)) (\\u. x) (\\u. u)', difficulty: 8, accepts: ['pred'] },
];

let playState = {
  index: 0,
  score: 0,
  startTime: 0,
  attempts: 0,
  givenUp: false,
  hintLevel: 0,
};

const SCORE_KEY = 'tromp_play_score';
const BEST_KEY = 'tromp_play_best';
const STATS_KEY = 'tromp_play_stats';

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0'); } catch { return 0; }
}
function saveBest(s) {
  try { localStorage.setItem(BEST_KEY, String(s)); } catch {}
}

// Long-running stats: total puzzles solved across all sessions, current
// streak (resets on skip / reveal / wrong-then-skip), all-time best streak.
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

function startGame() {
  playState = { index: 0, score: 0, startTime: performance.now(), attempts: 0, givenUp: false, hintLevel: 0, daily: false };
  loadPuzzle(true);
}

// ── Daily puzzle ────────────────────────────────────────────
// One puzzle per calendar day, generated deterministically from the date —
// not just picked from the static PUZZLES list. Every player sees the
// same puzzle on the same day. Solving updates a streak; missing a day
// resets it. Replaying the same day gives the same puzzle but doesn't
// re-bump the streak.
const DAILY_KEY = 'tromp_play_daily';
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
// Mulberry32 PRNG seeded from a date string. The sequence is stable per
// date, so every visitor on 2026-05-07 gets the exact same puzzle.
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
// Build a fresh challenge from one of three shape templates. Takes any
// RNG function — `generateDailyPuzzle` passes a date-seeded RNG so all
// players see the same daily, while `generateRandomPuzzle` passes
// Math.random for genuinely fresh puzzles each time.
function generatePuzzleFromRng(rng) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const shape = pick(['compose', 'app_combo', 'hard_pick']);

  if (shape === 'compose') {
    // λx. F (G x) — composition of unary numeric combinators. With 1/3
    // probability we go three deep for a tougher pattern.
    const fns = ['succ', 'pred'];
    const len = pick([2, 2, 3]);
    let body = 'x';
    const used = [];
    for (let i = 0; i < len; i++) {
      const f = pick(fns);
      used.push(f);
      body = f + ' (' + body + ')';
    }
    const expr = '\\x. ' + body;
    return {
      name: used.reverse().join(' ∘ '),
      expr,
      difficulty: Math.min(8, 5 + len),
      accepts: [expr],
    };
  }

  if (shape === 'app_combo') {
    // F G — apply a binary combinator to a unary one (B succ, C not, …).
    const F = pick(['B', 'C', 'W']);
    const G = pick(['succ', 'pred', 'not']);
    const expr = F + ' ' + G;
    return { name: expr, expr, difficulty: 7, accepts: [expr] };
  }

  // hard_pick: deterministically pick from the difficulty-≥6 pool.
  const hard = PUZZLES.filter(p => p.difficulty >= 6);
  return hard[Math.floor(rng() * hard.length)];
}
function generateDailyPuzzle(dateKey) {
  return generatePuzzleFromRng(dailyRng(dateKey));
}
function generateRandomPuzzle() {
  return generatePuzzleFromRng(Math.random);
}
function loadDailyState() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return { lastSolved: null, streak: 0, bestStreak: 0 };
    const s = JSON.parse(raw);
    return Object.assign({ lastSolved: null, streak: 0, bestStreak: 0 }, s);
  } catch { return { lastSolved: null, streak: 0, bestStreak: 0 }; }
}
function saveDailyState(s) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); } catch {}
}
function startDaily() {
  const today = todayKey();
  const dailyPuzzle = generateDailyPuzzle(today);
  playState = {
    index: 0, score: 0, startTime: performance.now(),
    attempts: 0, givenUp: false, hintLevel: 0, daily: true,
    dailyPuzzle,
  };
  loadPuzzle(true);
  const ds = loadDailyState();
  const solvedToday = ds.lastSolved === today;
  feedback(
    'Daily puzzle for ' + today + ' — ' +
    (solvedToday ? '✓ already solved today' : 'solve to keep your streak going') +
    '  ·  current streak: ' + ds.streak + (ds.bestStreak ? ' (best ' + ds.bestStreak + ')' : ''),
    'hint'
  );
}
// Random mode: each click generates a brand-new procedural puzzle. Re-uses
// the daily-puzzle generator with Math.random so the difficulty stays in
// the "interesting" tier (compositions, combinator combos, hard picks).
// Storing the generated puzzle on playState as `dailyPuzzle` so the rest
// of the play UI (hint, reveal, color, check) treats it uniformly.
function startRandom() {
  playState = {
    index: 0, score: 0, startTime: performance.now(),
    attempts: 0, givenUp: false, hintLevel: 0, daily: true,
    dailyPuzzle: generateRandomPuzzle(),
  };
  loadPuzzle(true);
  feedback('Random puzzle — solve or click 🎲 again for another.', 'hint');
}
// Returns the active puzzle — daily mode pulls from playState.dailyPuzzle
// (the procedural challenge), normal mode indexes into the static list.
function currentPuzzle() {
  return playState.daily && playState.dailyPuzzle
    ? playState.dailyPuzzle
    : PUZZLES[playState.index];
}
// Toggle for free-of-charge color mode on the current puzzle's diagram.
// Re-renders without resetting timer / attempts / hints.
let PLAY_COLOR_ON = false;
function togglePlayColor() {
  PLAY_COLOR_ON = !PLAY_COLOR_ON;
  rerenderCurrentDiagram();
  const btn = document.getElementById('playColorBtn');
  if (btn) {
    btn.classList.toggle('active', PLAY_COLOR_ON);
    btn.textContent = PLAY_COLOR_ON ? '🎨 Color: ON' : '🎨 Color';
  }
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

// Smoothly transitions the diagram out, swaps to the new puzzle, transitions
// in. `instant=true` skips the out-fade (used for the very first load and on
// restart, where there's no previous diagram to slide away).
function loadPuzzle(instant) {
  if (playState.index >= PUZZLES.length) { showVictory(); return; }
  const dia = document.getElementById('playDiagramWrap');
  if (!instant && dia) {
    dia.classList.add('puzzle-out');
    setTimeout(() => { applyPuzzle(); dia.classList.remove('puzzle-out'); dia.classList.add('puzzle-in');
      setTimeout(() => dia.classList.remove('puzzle-in'), 350);
    }, 280);
  } else {
    applyPuzzle();
  }
}

function applyPuzzle() {
  const p = currentPuzzle();
  playState.startTime = performance.now();
  playState.attempts = 0;
  playState.givenUp = false;
  playState.hintLevel = 0;

  try {
    const ast = elaborate(parse(p.expr), allDefs());
    SCALE = 16;
    COLOR_MODE = PLAY_COLOR_ON;
    ANIM_ENABLED = false;
    renderDiagram(ast, 0, null, {
      svgId: 'playSVG', segsId: 'playSegs', zonesId: 'playZones',
      skipRedexZones: true,
    });
    // Add a viewBox so CSS sizing scales the SVG without cropping.
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

  document.getElementById('puzzleNum').textContent =
    playState.daily
      ? 'Daily — ' + p.name
      : 'Puzzle ' + (playState.index + 1) + ' / ' + PUZZLES.length;
  // Visual difficulty: filled stars for the puzzle's level + hollow stars
  // out to 8.  Coloured CSS-side based on .filled / .hollow classes.
  const diffEl = document.getElementById('puzzleDiff');
  diffEl.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const star = document.createElement('span');
    star.className = i < p.difficulty ? 'star filled' : 'star hollow';
    star.textContent = i < p.difficulty ? '★' : '☆';
    diffEl.appendChild(star);
  }
  // Progress bar across all puzzles.
  document.getElementById('playProgressFill').style.width =
    ((playState.index) / PUZZLES.length * 100) + '%';

  document.getElementById('playInput').value = '';
  document.getElementById('playInput').focus();
  document.getElementById('playFeedback').textContent = '';
  document.getElementById('playFeedback').className = 'play-feedback';
  document.getElementById('playScore').textContent = 'Score: ' + playState.score;
  document.getElementById('playBest').textContent = 'Best: ' + loadBest();
  document.getElementById('playStatsLine').textContent =
    'Solved ' + playStats.solved + ' · streak ' + playStats.streak +
    (playStats.bestStreak > 0 ? ' (best ' + playStats.bestStreak + ')' : '');
}

function checkAnswer() {
  const input = document.getElementById('playInput').value.trim();
  if (!input) return;
  playState.attempts++;
  const p = currentPuzzle();
  let userAst;
  try {
    userAst = elaborate(parse(input), allDefs());
  } catch (e) {
    feedback('Parse error: ' + e.message, 'bad');
    shakeInput();
    return;
  }
  const targetAst = elaborate(parse(p.expr), allDefs());
  if (alphaEqual(userAst, targetAst)) {
    const elapsed = (performance.now() - playState.startTime) / 1000;
    const speedBonus = Math.max(0, Math.round(20 - elapsed));
    const attemptPenalty = (playState.attempts - 1) * 5;
    const hintPenalty = playState.hintLevel * 3;
    const earned = Math.max(5, p.difficulty * 10 + speedBonus - attemptPenalty - hintPenalty);
    playState.score += earned;
    playStats.solved++;
    playStats.streak++;
    if (playStats.streak > playStats.bestStreak) playStats.bestStreak = playStats.streak;
    saveStats();
    let msg = '✓ Correct! +' + earned + ' pts (' + elapsed.toFixed(1) + 's, ' +
              playState.attempts + ' attempt' + (playState.attempts === 1 ? '' : 's') + ')';
    // Daily puzzle: bump streak only the first time today's puzzle is solved.
    if (playState.daily) {
      const today = todayKey();
      const ds = loadDailyState();
      if (ds.lastSolved !== today) {
        // Continuing yesterday's streak? Otherwise reset to 1.
        const yesterday = (() => {
          const d = new Date(); d.setDate(d.getDate() - 1);
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })();
        ds.streak = (ds.lastSolved === yesterday) ? ds.streak + 1 : 1;
        ds.lastSolved = today;
        if (ds.streak > ds.bestStreak) ds.bestStreak = ds.streak;
        saveDailyState(ds);
        msg += '  ·  daily streak: ' + ds.streak + (ds.bestStreak > ds.streak ? ' (best ' + ds.bestStreak + ')' : '');
      } else {
        msg += '  ·  daily already solved today';
      }
    }
    feedback(msg, 'ok');
    flashSuccess();
    if (playState.score > loadBest()) saveBest(playState.score);
    // Daily mode does NOT advance to the next puzzle — daily is one-and-done.
    if (!playState.daily) {
      setTimeout(() => { playState.index++; loadPuzzle(); }, 1400);
    }
  } else {
    feedback('✗ Not quite — keep trying.', 'bad');
    shakeInput();
  }
}

function flashSuccess() {
  const dia = document.getElementById('playDiagramWrap');
  if (!dia) return;
  dia.classList.remove('flash-success');
  void dia.offsetWidth; // restart animation
  dia.classList.add('flash-success');
  setTimeout(() => dia.classList.remove('flash-success'), 700);
}
function shakeInput() {
  const row = document.querySelector('.play-input-row');
  if (!row) return;
  row.classList.remove('error-shake');
  void row.offsetWidth;
  row.classList.add('error-shake');
  setTimeout(() => row.classList.remove('error-shake'), 380);
}

function feedback(msg, kind) {
  const el = document.getElementById('playFeedback');
  el.textContent = msg;
  el.className = 'play-feedback ' + (kind || '');
}

// Hints escalate. Each level reveals more, but uses 3 pts of the eventual
// reward when you do solve. 4th click + tells you to give up.
function showHint() {
  const p = currentPuzzle();
  playState.hintLevel++;
  let msg;
  if (playState.hintLevel === 1) {
    let lambdas = 0, apps = 0;
    try {
      const ast = elaborate(parse(p.expr), allDefs());
      (function walk(n) {
        if (n.t === 'lam') { lambdas++; walk(n.b); }
        else if (n.t === 'app') { apps++; walk(n.f); walk(n.a); }
      })(ast);
    } catch {}
    msg = 'Hint 1/3: ' + lambdas + ' λ binder' + (lambdas === 1 ? '' : 's') +
          ', ' + apps + ' application' + (apps === 1 ? '' : 's') +
          ' (each correct hint costs 3 pts).';
    // For big / hard puzzles, the first hint also enables color-coding —
    // it's the cheapest, most readable visual aid we can give without
    // spoiling the answer. Skip if the user already turned color on.
    const isBig = p.difficulty >= 5 || (lambdas + apps) >= 8;
    if (isBig && !PLAY_COLOR_ON) {
      PLAY_COLOR_ON = true;
      rerenderCurrentDiagram();
      const btn = document.getElementById('playColorBtn');
      if (btn) {
        btn.classList.add('active');
        btn.textContent = '🎨 Color: ON';
      }
      msg += '  ·  variables now color-coded';
    }
  } else if (playState.hintLevel === 2) {
    msg = 'Hint 2/3: starts with "' + p.expr.slice(0, 6).replace(/\\/g, 'λ') + '…"';
  } else if (playState.hintLevel === 3) {
    msg = 'Hint 3/3: the name begins with "' + p.name[0] + '"';
  } else {
    msg = 'No more hints — try Reveal answer.';
  }
  feedback(msg, 'hint');
}

function giveUp() {
  if (!confirm("Reveal the answer? You won't score this puzzle.")) return;
  const p = currentPuzzle();
  feedback('Answer: ' + p.expr.replace(/\\/g, 'λ') +
           '   (also accepted: ' + p.accepts.slice(0, 3).join(', ') + ')', 'hint');
  playState.givenUp = true;
  playStats.streak = 0;
  saveStats();
  // Daily is one-and-done — don't auto-advance to a different puzzle.
  if (!playState.daily) {
    setTimeout(() => { playState.index++; loadPuzzle(); }, 3000);
  }
}

function skipPuzzle() {
  playStats.streak = 0;
  saveStats();
  playState.index++;
  loadPuzzle();
}

function showVictory() {
  document.getElementById('puzzleNum').textContent = '✦ Done!';
  document.getElementById('puzzleDiff').innerHTML = '';
  const svg = document.getElementById('playSVG');
  if (svg) {
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    svg.removeAttribute('viewBox');
  }
  document.getElementById('playProgressFill').style.width = '100%';
  feedback('You finished all ' + PUZZLES.length + ' puzzles! Final score: ' + playState.score, 'ok');
  if (playState.score > loadBest()) saveBest(playState.score);
}

function initPlay() {
  loadStats();
  const input = document.getElementById('playInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }
  });
  // Doc-level keyboard shortcuts using Alt-modifier so they don't fight typing.
  document.addEventListener('keydown', e => {
    if (!e.altKey) return;
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); showHint(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); skipPuzzle(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); giveUp(); }
  });
  startGame();
}

// ═══════════════════════════════════════════════════════════════
// REVERSE MODE — instead of identifying the diagram, the player has
// to invent an expression that β-reduces to the displayed target.
// Several distinct expressions are accepted (succ 1, plus 1 1, …),
// validated by running a normal-order reduction with a step cap and
// comparing α-equivalence with the target's normal form.
// ═══════════════════════════════════════════════════════════════

const REVERSE_TARGETS = [
  { name: '2',    target: '\\f. \\x. f (f x)',
    hint: 'try succ 1, plus 1 1, or mult 1 2',
    examples: ['succ 1', 'plus 1 1', 'mult 1 2'] },
  { name: '3',    target: '\\f. \\x. f (f (f x))',
    hint: 'plus 1 2, succ (succ 1), mult 3 1…',
    examples: ['plus 1 2', 'succ (succ 1)', 'mult 3 1'] },
  { name: '4',    target: '\\f. \\x. f (f (f (f x)))',
    hint: 'plus 2 2, mult 2 2, pow 2 2',
    examples: ['plus 2 2', 'mult 2 2', 'pow 2 2'] },
  { name: '6',    target: '\\f. \\x. f (f (f (f (f (f x)))))',
    hint: 'plus 3 3, mult 2 3, plus 1 5',
    examples: ['plus 3 3', 'mult 2 3', 'plus 1 5'] },
  { name: 'true', target: '\\x. \\y. x',
    hint: 'K, not false, and true true',
    examples: ['K', 'not false', 'and true true'] },
  { name: 'false', target: '\\x. \\y. y',
    hint: 'KI, not true, and false true',
    examples: ['K I', 'not true', 'and false true'] },
  { name: 'I',    target: '\\x. x',
    hint: 'apply S K K — or S K anything',
    examples: ['S K K', 'S K I'] },
  { name: '0',    target: '\\f. \\x. x',
    hint: 'pred 1, mult 0 anything, sub 1 1',
    examples: ['pred 1', 'mult 0 5', 'sub 1 1'] },
  { name: '1',    target: '\\f. \\x. f x',
    hint: 'pred 2, succ 0, mult 1 1',
    examples: ['pred 2', 'succ 0', 'mult 1 1'] },
  { name: 'pair true false', target: 'pair true false',
    hint: 'fst returns true; snd returns false',
    examples: ['pair true false', 'pair K (K I)'] },
];

function startReverse() {
  playState = {
    index: 0, score: 0, startTime: performance.now(),
    attempts: 0, givenUp: false, hintLevel: 0,
    daily: false, mode: 'reverse',
  };
  loadPuzzle(true);
}

// Reduce an AST using normal-order β-reduction up to a step cap.
// Returns null on divergence so we can flag the user's input as
// "didn't terminate within budget" rather than silently rejecting.
function reduceToNormalForm(ast, maxSteps = 250) {
  let cur = ast;
  for (let i = 0; i < maxSteps; i++) {
    let r;
    try { r = doStep(cur, STRATEGIES.normal); }
    catch (e) { return null; }
    if (!r.reduced) return cur;
    cur = r.node;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// SPEEDRUN MODE — same identification game as Classic, but the
// global timer is the score: how fast can you clear the deck?
// Hints/skips/reveals subtract time penalties.
// ═══════════════════════════════════════════════════════════════

let speedrunStart = 0;
let speedrunPenalty = 0;
let speedrunInterval = null;

function startSpeedrun() {
  playState = {
    index: 0, score: 0, startTime: performance.now(),
    attempts: 0, givenUp: false, hintLevel: 0,
    daily: false, mode: 'speedrun',
  };
  speedrunStart = performance.now();
  speedrunPenalty = 0;
  if (speedrunInterval) clearInterval(speedrunInterval);
  speedrunInterval = setInterval(updateSpeedrunDisplay, 200);
  loadPuzzle(true);
}

function updateSpeedrunDisplay() {
  if (!playState.mode || playState.mode !== 'speedrun') {
    if (speedrunInterval) { clearInterval(speedrunInterval); speedrunInterval = null; }
    return;
  }
  const elapsed = (performance.now() - speedrunStart) / 1000 + speedrunPenalty;
  const el = document.getElementById('playScore');
  if (el) el.textContent = '⏱ ' + elapsed.toFixed(1) + 's';
}

// Hook into the existing flow: when the player solves a puzzle in
// classic/speedrun mode, both advance to the next; speedrun ALSO
// keeps the timer running, and final time replaces "score" on victory.
// We achieve this by reusing existing checkAnswer for classic puzzles
// and overlaying speedrun timing in updateSpeedrunDisplay.

// The existing checkAnswer/applyPuzzle/loadPuzzle don't know about
// modes. We patch them via wrapping at the end of the file so the
// rest of play.js stays untouched.
const _origApplyPuzzle = applyPuzzle;
applyPuzzle = function applyPuzzleWithModes() {
  const m = playState.mode || 'classic';
  if (m === 'reverse') {
    applyReversePuzzle();
    return;
  }
  _origApplyPuzzle();
  // Mode banner.
  setModeHelp(m);
};

function applyReversePuzzle() {
  if (playState.index >= REVERSE_TARGETS.length) { showReverseVictory(); return; }
  const p = REVERSE_TARGETS[playState.index];
  playState.startTime = performance.now();
  playState.attempts = 0;
  playState.givenUp = false;
  playState.hintLevel = 0;

  // Render the TARGET diagram: this is what the user has to land on.
  try {
    const ast = elaborate(parse(p.target), allDefs());
    SCALE = 16; COLOR_MODE = false; ANIM_ENABLED = false;
    renderDiagram(ast, 0, null, {
      svgId: 'playSVG', segsId: 'playSegs', zonesId: 'playZones',
      skipRedexZones: true,
    });
    const svg = document.getElementById('playSVG');
    if (svg) {
      const w = svg.getAttribute('width'), h = svg.getAttribute('height');
      if (w && h && parseFloat(w) > 0) {
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    }
  } catch (e) { console.error('Reverse puzzle render failed:', e); }

  document.getElementById('puzzleNum').textContent =
    '↺ Reverse ' + (playState.index + 1) + ' / ' + REVERSE_TARGETS.length +
    ' — target: ' + p.name;
  document.getElementById('puzzleDiff').innerHTML = '';
  document.getElementById('playProgressFill').style.width =
    ((playState.index) / REVERSE_TARGETS.length * 100) + '%';

  document.getElementById('playInput').value = '';
  document.getElementById('playInput').focus();
  document.getElementById('playInput').setAttribute('placeholder',
    'an expression that reduces to ' + p.name + '…');
  document.getElementById('playFeedback').textContent = '';
  document.getElementById('playFeedback').className = 'play-feedback';
  document.getElementById('playScore').textContent = 'Score: ' + playState.score;
  document.getElementById('playBest').textContent = 'Best: ' + loadBest();
  document.getElementById('playStatsLine').textContent =
    'Reverse mode — type ANY expression that β-reduces to the diagram.';
  setModeHelp('reverse');
}

function showReverseVictory() {
  document.getElementById('puzzleNum').textContent = '✦ All reverses cleared';
  document.getElementById('puzzleDiff').innerHTML = '';
  const svg = document.getElementById('playSVG');
  if (svg) { svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.removeAttribute('viewBox'); }
  document.getElementById('playProgressFill').style.width = '100%';
  feedback('All ' + REVERSE_TARGETS.length + ' reverse puzzles solved. Score: ' + playState.score, 'ok');
}

const _origCheckAnswer = checkAnswer;
checkAnswer = function checkAnswerWithModes() {
  const m = playState.mode || 'classic';
  if (m === 'reverse') return checkReverseAnswer();
  _origCheckAnswer();
  // Speedrun: when answer is correct AND we just advanced, record nothing
  // extra — the timer keeps ticking; the existing setTimeout(loadPuzzle)
  // will move to the next.
};

function checkReverseAnswer() {
  const input = document.getElementById('playInput').value.trim();
  if (!input) return;
  playState.attempts++;
  const p = REVERSE_TARGETS[playState.index];

  let userAst;
  try { userAst = elaborate(parse(input), allDefs()); }
  catch (e) { feedback('Parse error: ' + e.message, 'bad'); shakeInput(); return; }

  // Reject the trivial answer "literally the target".
  let targetAst;
  try { targetAst = elaborate(parse(p.target), allDefs()); }
  catch (e) { return; }
  if (alphaEqual(userAst, targetAst)) {
    feedback('That IS the target. Need an expression that reduces to it.', 'bad');
    shakeInput();
    return;
  }

  // Reduce user's expression and compare to the target's normal form.
  const userNormal   = reduceToNormalForm(userAst);
  const targetNormal = reduceToNormalForm(targetAst);
  if (userNormal === null) {
    feedback('Your expression didn\'t terminate within the step budget.', 'bad');
    shakeInput();
    return;
  }
  if (targetNormal && alphaEqual(userNormal, targetNormal)) {
    const elapsed = (performance.now() - playState.startTime) / 1000;
    const earned = Math.max(8, 18 + Math.max(0, Math.round(20 - elapsed))
      - (playState.attempts - 1) * 3 - playState.hintLevel * 2);
    playState.score += earned;
    playStats.solved++;
    playStats.streak++;
    if (playStats.streak > playStats.bestStreak) playStats.bestStreak = playStats.streak;
    saveStats();
    feedback('✓ Reduces to ' + p.name + '! +' + earned + ' pts.', 'ok');
    flashSuccess();
    if (playState.score > loadBest()) saveBest(playState.score);
    setTimeout(() => { playState.index++; loadPuzzle(); }, 1200);
  } else {
    feedback('✗ Reduces to something else.', 'bad');
    shakeInput();
  }
}

function setModeHelp(mode) {
  const el = document.getElementById('playModeHelp');
  if (!el) return;
  if (mode === 'reverse') {
    el.innerHTML =
      'Reverse mode: <i>type any expression that β-reduces to the displayed target</i>. ' +
      'Built-ins like <code>succ</code>, <code>plus</code>, <code>mult</code>, <code>pred</code>, ' +
      '<code>K</code>, <code>not</code>, <code>and</code>… are all loaded.';
  } else if (mode === 'speedrun') {
    el.innerHTML =
      'Speedrun: solve as many as you can, fast. Hints (+3s), skips (+8s), and reveals (+15s) add time penalties.';
  } else if (mode === 'daily') {
    el.innerHTML =
      'Daily puzzle — one per day. Solving keeps your streak going.';
  } else {
    el.innerHTML =
      'Acceptable answers include the <i>name</i> of the combinator (e.g. <code>I</code>, <code>K</code>, ' +
      '<code>plus</code>) or any α-equivalent expression. Numerals can be answered with their digit ' +
      '(e.g. <code>2</code>) or their full form.';
  }
}

// Speedrun penalty hooks — wrap the existing helpers so penalties are
// accumulated only when in speedrun mode.
const _origShowHint   = showHint;
const _origSkipPuzzle = skipPuzzle;
const _origGiveUp     = giveUp;
showHint   = function () { if (playState.mode === 'speedrun') speedrunPenalty += 3;  _origShowHint(); };
skipPuzzle = function () { if (playState.mode === 'speedrun') speedrunPenalty += 8;  _origSkipPuzzle(); };
giveUp     = function () { if (playState.mode === 'speedrun') speedrunPenalty += 15; _origGiveUp(); };

// Speedrun-aware victory: report the final time + penalties instead of
// the misleading "score" display, and stop the clock.
const _origShowVictory = showVictory;
showVictory = function () {
  if (playState.mode === 'speedrun') {
    const total = ((performance.now() - speedrunStart) / 1000 + speedrunPenalty).toFixed(1);
    if (speedrunInterval) { clearInterval(speedrunInterval); speedrunInterval = null; }
    document.getElementById('puzzleNum').textContent = '✦ Speedrun done!';
    document.getElementById('puzzleDiff').innerHTML = '';
    const svg = document.getElementById('playSVG');
    if (svg) { svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.removeAttribute('viewBox'); }
    document.getElementById('playProgressFill').style.width = '100%';
    feedback('Speedrun complete in ' + total + 's (incl. penalties).', 'ok');
    return;
  }
  _origShowVictory();
};
