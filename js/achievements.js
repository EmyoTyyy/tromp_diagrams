// ═══════════════════════════════════════════════════════════════
// achievements.js — cross-page unlock tracker
//
// Each achievement has an id, a title, a one-line hint, and a public
// JS hook other modules call to award it. Unlocked ids live in
// localStorage as a JSON array; the /achievements/ page renders the
// catalogue with locked/unlocked badges.
//
// Adding a new achievement:
//   1. Append to ACHIEVEMENTS below.
//   2. Call unlockAchievement('<id>') wherever the condition fires.
//   3. The achievements page picks it up automatically — no other
//      wiring needed.
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  const KEY = 'tromp_achievements_v1';

  // The catalogue. Order = display order on /achievements/.
  // `icon` is a single Unicode glyph rendered inside the badge. Could
  // swap for inline SVG later if we want themed icons.
  const ACHIEVEMENTS = [
    // ── Core visualizer flow ──
    { id: 'first-draw',    icon: 'λ',  title: 'First steps',         hint: 'Draw your first λ-expression in the visualizer.' },
    { id: 'first-step',    icon: '▶',  title: 'One small step',      hint: 'Perform a single β-reduction.' },
    { id: 'back-step',     icon: '◀',  title: 'Take it back',        hint: 'Use the step-back button to undo a reduction.' },
    { id: 'normal-form',   icon: '◎',  title: 'Normal form',         hint: 'Reduce an expression all the way to normal form.' },
    { id: 'big-reduction', icon: '∞',  title: 'Marathon',            hint: 'Run a reduction past 1,000 steps.' },
    { id: 'mega-reduction',icon: '⧖',  title: 'Halt me if you can',  hint: 'Push a single reduction past 10,000 steps.' },
    { id: 'god-mode',      icon: '✦',  title: 'Beyond animation',    hint: 'Enable god mode and finish a fast reduction.' },
    // ── Term-specific ──
    { id: 'used-y',        icon: 'Y',  title: 'Fixed-point fan',     hint: 'Use the Y combinator in an expression.' },
    { id: 'used-omega',    icon: 'Ω',  title: 'You broke math',      hint: 'Try to reduce Ω = (λx.x x)(λx.x x).' },
    // ── Pane / editor interactions ──
    { id: 'multi-pane',    icon: '⫶',  title: 'Two heads',           hint: 'Open at least two visualizer panes at once.' },
    { id: 'def-added',     icon: '+',  title: 'Bring your own',      hint: 'Save a custom definition in the sidebar.' },
    { id: 'copy-expr',     icon: '⎘',  title: 'Take it home',        hint: 'Copy an expression to your clipboard.' },
    { id: 'png-export',    icon: '↓',  title: 'Souvenir',            hint: 'Export a Tromp diagram as PNG.' },
    { id: 'find-used',     icon: '⌕',  title: 'Got it!',             hint: 'Open find / replace in an editor.' },
    { id: 'presentation',  icon: '▸',  title: 'Showtime',            hint: 'Enter presentation mode.' },
    // ── Output / sharing ──
    { id: 'recorded',      icon: '●',  title: 'On tape',             hint: 'Record a reduction as a video.' },
    { id: 'shared',        icon: '↗',  title: 'Spread the gospel',   hint: 'Share an expression via the share button.' },
    // ── Play / progression ──
    { id: 'play-daily',    icon: '☀',  title: 'Daily devotee',       hint: 'Win a daily challenge in play mode.' },
    { id: 'play-extreme',  icon: '★',  title: 'Extreme.',            hint: 'Win an extreme-difficulty daily challenge.' },
    // ── Site exploration ──
    { id: 'cheatsheet',    icon: '?',  title: 'RTFM',                hint: 'Visit the cheatsheet page.' },
    { id: 'learn-visited', icon: '☷',  title: 'Curious mind',        hint: 'Visit the Learn page.' },
    { id: 'tree-visited',  icon: '⤳',  title: 'Branching out',       hint: 'Visit the Tree page.' },
    { id: 'combs-visited', icon: 'B',  title: 'Collector',           hint: 'Visit the Combinators page.' },
    { id: 'enc-visited',   icon: '0',  title: 'Numbers from nothing', hint: 'Visit the Encodings page.' },
    { id: 'halt-visited',  icon: 'H',  title: 'Decidedly undecidable', hint: 'Visit the Halting page.' },
    { id: 'hist-visited',  icon: '↺',  title: 'Time traveller',      hint: 'Visit the History page.' },
    { id: 'globetrotter',  icon: '◯',  title: 'Cartographer',        hint: 'Visit every page on the site.' },
    // ── Cosmetic / meta ──
    { id: 'all-themes',    icon: '◐',  title: 'Eye of the beholder', hint: 'Try every available theme.' },
    { id: 'konami',        icon: '↑',  title: 'Old-school',          hint: 'Discover the konami-code easter egg.' },
    // ── Gold tier (super hard) ──
    // Marked with `gold:true` for a different (warm-amber) visual.
    // These are intentionally hard and grindy — the kind of thing a
    // power user will chip away at over weeks.
    { id: 'mega-reduction-2', gold: true, icon: '⌬', title: 'Beyond the event horizon', hint: 'Push a single reduction past 100,000 steps.' },
    { id: 'daily-streak-7',   gold: true, icon: '◉', title: 'Week of devotion',         hint: 'Maintain a 7-day daily-challenge streak.' },
    { id: 'daily-perfect',    gold: true, icon: '♢', title: 'Flawless',                 hint: 'Win a daily challenge on the first try with no hints used.' },
    { id: 'combinator-master',gold: true, icon: '✺', title: 'Master of combinators',   hint: 'Use S, K, I, B, C, W and Y across expressions you draw.' },
    { id: 'skibidi',          gold: true, icon: '🚽', title: 'Skibidi dop dop',           hint: 'Draw an expression containing the combinator sequence S K I B I D I.' },
    // KEEP 'all-clear' LAST. It's the meta-achievement that fires
    // when every other entry is unlocked, so it always has to come
    // after the rest in display order. A defensive sort below
    // re-pins it to the end even if a future addition slips past
    // this line, but please don't rely on that — keep new entries
    // ABOVE this one.
    { id: 'all-clear',        gold: true, icon: '✷', title: 'Completionist',            hint: 'Unlock every other achievement on the site.' },
  ];
  // Guarantee 'all-clear' is the final entry regardless of source
  // order. Without this, an inadvertent append below it would render
  // it mid-list and read as awkward (completionist sandwiched
  // between two regular achievements).
  {
    const i = ACHIEVEMENTS.findIndex(a => a.id === 'all-clear');
    if (i >= 0 && i !== ACHIEVEMENTS.length - 1) {
      ACHIEVEMENTS.push(ACHIEVEMENTS.splice(i, 1)[0]);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }
  function save(set) {
    try { localStorage.setItem(KEY, JSON.stringify([...set])); }
    catch { /* private mode — ignore */ }
  }

  // Build a one-off toast for the unlock so we can wire a custom
  // click handler (jump to the catalogue) onto it without altering
  // siteToast's signature, which other features still use.
  function showUnlockToast(a) {
    let host = document.getElementById('siteToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'siteToastHost';
      host.className = 'site-toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'site-toast ach-toast';
    t.innerHTML =
      '<span class="site-toast-glyph">' + a.icon + '</span>' +
      '<span>Unlocked: ' + a.title + '</span>' +
      '<span class="ach-toast-arrow" aria-hidden="true">→</span>';
    t.title = 'Open achievements';
    t.style.cursor = 'pointer';
    t.style.pointerEvents = 'auto';
    t.addEventListener('click', () => {
      // Path-aware: subpages live at /<name>/; root is /.
      const SUB = /\/(visualizer|play|learn|tree|combinators|encodings|halting|history|cheatsheet|about|achievements)\/(index\.html)?$/i;
      const prefix = SUB.test(window.location.pathname) ? '../' : '';
      window.location.href = prefix + 'achievements/';
    });
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 320);
    }, 4200);
  }

  // Public: unlock by id. No-op if already unlocked or id unknown.
  // Pops a toast on first-time unlock so the user knows it happened.
  function unlock(id) {
    if (!ACHIEVEMENTS.some(a => a.id === id)) return;
    const set = load();
    if (set.has(id)) return;
    set.add(id);
    save(set);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) showUnlockToast(a);
    // Completionist check — fires once every other achievement is
    // unlocked. Skip if the just-unlocked id is itself 'all-clear'
    // (we'd loop) or if it's gold (gold doesn't gate gold).
    if (id !== 'all-clear') {
      const allOthers = ACHIEVEMENTS
        .filter(x => x.id !== 'all-clear')
        .every(x => set.has(x.id));
      if (allOthers) unlock('all-clear');
    }
  }

  // Track which canonical combinators the user has typed into the
  // visualiser across all sessions. Once the full set is seen,
  // award 'combinator-master'. Whole-word regex so names embedded
  // in identifiers (e.g. "Yoda") don't count.
  const COMBS_KEY = 'tromp_combs_used_v1';
  const COMBS = ['S', 'K', 'I', 'B', 'C', 'W', 'Y'];
  function trackCombinatorsIn(src) {
    if (!src) return;
    let seen;
    try { seen = new Set(JSON.parse(localStorage.getItem(COMBS_KEY) || '[]')); }
    catch { seen = new Set(); }
    let changed = false;
    for (const c of COMBS) {
      if (seen.has(c)) continue;
      if (new RegExp('(^|[^A-Za-z0-9_])' + c + '(?![A-Za-z0-9_])').test(src)) {
        seen.add(c); changed = true;
      }
    }
    if (changed) {
      try { localStorage.setItem(COMBS_KEY, JSON.stringify([...seen])); } catch {}
    }
    if (COMBS.every(c => seen.has(c))) unlock('combinator-master');
  }
  window.trackCombinators = trackCombinatorsIn;

  // Helper: pages can introspect or render the catalogue.
  function list()   { return ACHIEVEMENTS.slice(); }
  function status() {
    const set = load();
    return ACHIEVEMENTS.map(a => ({ ...a, unlocked: set.has(a.id) }));
  }

  // Theme-tracker side-channel: when the user switches theme, remember
  // the set of themes ever picked. When the set covers every option,
  // award the all-themes achievement. Hooks onto window.applyTheme so
  // we don't have to modify site.js.
  const SEEN_THEMES_KEY = 'tromp_seen_themes_v1';
  function loadSeenThemes() {
    try {
      const raw = localStorage.getItem(SEEN_THEMES_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }
  function saveSeenThemes(s) {
    try { localStorage.setItem(SEEN_THEMES_KEY, JSON.stringify([...s])); } catch {}
  }
  // Total theme count is whatever site.js's THEMES array exposes.
  // We can't read it directly, so we count the visible swatches in
  // the nav drawer once it's been injected.
  function maybeAwardAllThemes(themeId) {
    const seen = loadSeenThemes();
    seen.add(themeId || '');
    saveSeenThemes(seen);
    const swatches = document.querySelectorAll('.theme-swatch');
    if (swatches.length > 0 && seen.size >= swatches.length) {
      unlock('all-themes');
    }
  }
  // Wrap window.applyTheme once site.js has defined it.
  function hookThemeWrapper() {
    const orig = window.applyTheme;
    if (typeof orig !== 'function' || orig.__achHooked) return;
    window.applyTheme = function(id) {
      orig(id);
      maybeAwardAllThemes(id);
    };
    window.applyTheme.__achHooked = true;
  }
  // applyTheme is defined inside site.js's IIFE which runs immediately
  // when the script loads; we just have to wait until that file has
  // had a chance to run before wrapping.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookThemeWrapper);
  } else {
    hookThemeWrapper();
  }

  // Page-visit unlocks — each fires when achievements.js loads on the
  // matching path. PAGE_ACHS pairs a URL slug with an achievement id;
  // hitting them all also awards the compound 'globetrotter' badge.
  const PAGE_ACHS = [
    { re: /\/cheatsheet\//,    id: 'cheatsheet'    },
    { re: /\/learn\//,         id: 'learn-visited' },
    { re: /\/tree\//,          id: 'tree-visited'  },
    { re: /\/combinators\//,   id: 'combs-visited' },
    { re: /\/encodings\//,     id: 'enc-visited'   },
    { re: /\/halting\//,       id: 'halt-visited'  },
    { re: /\/history\//,       id: 'hist-visited'  },
  ];
  for (const p of PAGE_ACHS) {
    if (p.re.test(location.pathname)) unlock(p.id);
  }
  // If all page-visit achievements are now unlocked, award globetrotter.
  {
    const set = load();
    const allVisited = PAGE_ACHS.every(p => set.has(p.id));
    if (allVisited) unlock('globetrotter');
  }

  window.unlockAchievement = unlock;
  window.listAchievements = list;
  window.achievementStatus = status;
})();
