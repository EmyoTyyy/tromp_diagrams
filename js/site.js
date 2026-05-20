// ═══════════════════════════════════════════════════════════════
// site.js — cross-page goodies. Loaded by every page.
//
//   • Konami code     → ↑↑↓↓←→←→ba opens the visualizer with Ω,
//                       the simplest non-terminating term, and
//                       a one-shot toast: "you broke math".
//   • Hidden λ unlock → click the ☰ nav button 7 times in a row
//                       (no nav-open in between) to reveal a
//                       hidden footer line with the Iota
//                       combinator and a cheeky note.
//   • Fun facts       → injects a random "did you know?" line into
//                       any element with id="funFact" or, if there
//                       is none, into .page-footer.
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Konami code (↑↑↓↓←→←→ba) ────────────────────────────────
  const KONAMI = [
    'ArrowUp', 'ArrowUp',
    'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight',
    'ArrowLeft', 'ArrowRight',
    'b', 'a'
  ];
  let konamiIdx = 0;
  document.addEventListener('keydown', (e) => {
    // Don't fire while the user is typing in inputs / textareas.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === KONAMI[konamiIdx]) {
      konamiIdx++;
      if (konamiIdx === KONAMI.length) {
        konamiIdx = 0;
        triggerKonami();
      }
    } else {
      konamiIdx = (key === KONAMI[0]) ? 1 : 0;
    }
  });

  function triggerKonami() {
    // First successful konami also earns an achievement (no-op if
    // achievements.js isn't loaded on this page).
    if (typeof window.unlockAchievement === 'function') {
      window.unlockAchievement('konami');
    }
    // Path-aware: each subpage now lives at /<name>/ (or /<name>/index.html).
    // Root pages are /, /index.html, /404.html.
    const SUBPAGE_RE = /\/(visualizer|play|learn|tree|combinators|encodings|halting|history|cheatsheet|about)\/(index\.html)?$/i;
    const inSubpage = SUBPAGE_RE.test(window.location.pathname);
    const prefix = inSubpage ? '../' : '';
    // Ω = (\x. x x)(\x. x x)  — the canonical non-terminating term.
    const url = prefix + 'visualizer/?expr=' + encodeURIComponent('(\\x. x x)(\\x. x x)') + '&konami=1';
    siteToast('you broke math', 'λ');
    setTimeout(() => { window.location.href = url; }, 700);
  }

  // ── Hidden-λ counter on the ☰ button ───────────────────────
  let lambdaClicks = 0;
  let lambdaTimer = null;
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('#navToggle');
    if (!btn) return;
    lambdaClicks++;
    clearTimeout(lambdaTimer);
    lambdaTimer = setTimeout(() => { lambdaClicks = 0; }, 1500);
    if (lambdaClicks >= 7) {
      lambdaClicks = 0;
      revealHiddenLambda();
    }
  });

  function revealHiddenLambda() {
    siteToast('ι := \\f. f S K — Iota unlocked', 'ι');
    // Stash the unlock so other pages can show the hidden combinator.
    try { localStorage.setItem('tromp_iota_unlocked', '1'); } catch {}
    // Append a one-line footer message if a footer exists.
    const f = document.querySelector('.page-footer');
    if (f && !f.querySelector('.iota-line')) {
      const span = document.createElement('span');
      span.className = 'iota-line';
      span.style.cssText = 'display:block; margin-top:8px; opacity:.7; font-size:.78rem;';
      span.innerHTML = '· hidden: <code>ι = \\f. f S K</code> — the one-combinator basis. ·';
      f.appendChild(span);
    }
  }

  // ── "Did you know?" fun fact rotator ───────────────────────
  const FUN_FACTS = [
    'The λ in lambda calculus is a typographic accident — Church meant <i>x̂</i>, but the printer couldn\'t set the hat.',
    'Every computable function can be written as a λ-term — Turing\'s thesis, Church\'s thesis, same coin.',
    'The Y combinator <code>\\f. (\\x. f (x x)) (\\x. f (x x))</code> is how λ-calculus invents recursion without naming functions.',
    'Tromp diagrams compress to BLC — Binary Lambda Calculus — where the empty program is 30 bits.',
    'The Ω term <code>(\\x. x x)(\\x. x x)</code> reduces to itself forever. It\'s the smallest infinite loop.',
    'Booleans, numerals, pairs and lists can all be encoded as functions. Church\'s "everything is a function" wasn\'t a metaphor.',
    '<code>S K K</code> behaves exactly like the identity function. SKI is Turing-complete on its own.',
    'α-equivalence: <code>\\x. x</code> and <code>\\y. y</code> are <i>literally</i> the same function. The name is just scaffolding.',
    'β-reduction is the only "rule" in λ-calculus. Everything else is bookkeeping.',
    'John Tromp\'s diagrams turn nesting depth into vertical lines and applications into horizontals — math becomes architecture.',
    'The fixed-point combinator has infinite cousins. <code>Y</code>, <code>Θ</code>, <code>U</code>... all reach the same place.',
    'In untyped λ-calculus, <i>everything</i> is a function. There are no numbers, only encodings of numbers.',
  ];

  function pickFact() {
    return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
  }

  function injectFunFact() {
    let host = document.getElementById('funFact');
    if (!host) {
      const f = document.querySelector('.page-footer');
      if (!f) return;
      host = document.createElement('div');
      host.id = 'funFact';
      host.className = 'fun-fact';
      f.parentNode.insertBefore(host, f);
    }
    host.innerHTML = '<span class="fun-fact-label">did you know?</span> ' + pickFact();
  }

  // ── Toast helper ───────────────────────────────────────────
  function siteToast(msg, glyph) {
    let host = document.getElementById('siteToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'siteToastHost';
      host.className = 'site-toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'site-toast';
    t.innerHTML = (glyph ? '<span class="site-toast-glyph">' + glyph + '</span>' : '') + msg;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 2400);
  }

  // Expose for pages that want to toast.
  window.siteToast = siteToast;

  // ── Theme picker (cross-page) ─────────────────────────────
  // Themes are pure CSS-variable overrides defined in theme.css under
  // html[data-theme="<name>"]. Persisted in localStorage so the
  // chosen palette sticks across pages and reloads. The default
  // (cyan) has no data-theme attribute — just remove the attr.
  const THEME_KEY = 'tromp_theme_v1';
  const THEMES = [
    { id: '',         name: 'Cyan (default)', swatch: ['#0a0a12', '#a0e0ff', '#80e0a0'] },
    { id: 'dracula',  name: 'Dracula',        swatch: ['#282a36', '#bd93f9', '#50fa7b'] },
    { id: 'monokai',  name: 'Monokai',        swatch: ['#272822', '#66d9ef', '#a6e22e'] },
    { id: 'rose',     name: 'Rose',           swatch: ['#1a1014', '#ffb0c8', '#ffd6b0'] },
    { id: 'light',    name: 'Light',          swatch: ['#f5f6f8', '#2563eb', '#16a34a'] },
  ];
  function applyTheme(id) {
    if (id && THEMES.some(t => t.id === id && t.id !== '')) {
      document.documentElement.setAttribute('data-theme', id);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; }
    catch { return ''; }
  }
  function saveTheme(id) {
    try {
      if (id) localStorage.setItem(THEME_KEY, id);
      else localStorage.removeItem(THEME_KEY);
    } catch { /* private mode — skip */ }
  }
  // Apply the saved theme as soon as possible so there's no flash of
  // the default palette on slow loads. Re-run on DOMContentLoaded too
  // in case the script ran before <html> was fully parsed.
  applyTheme(loadTheme());

  // Inject the theme picker into the nav drawer. Each page has its
  // own drawer markup so we hook into whatever's present.
  function injectThemePicker() {
    const drawer = document.querySelector('.nav-drawer');
    if (!drawer || drawer.querySelector('.theme-picker')) return;
    const current = loadTheme();
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.innerHTML =
      '<div class="theme-picker-label">Theme</div>' +
      '<div class="theme-swatches">' +
      THEMES.map(t => {
        const active = (t.id === current) ? ' active' : '';
        const dots = t.swatch.map(c =>
          '<span class="theme-dot" style="background:' + c + '"></span>'
        ).join('');
        return '<button type="button" class="theme-swatch' + active + '" ' +
               'data-theme-id="' + t.id + '" title="' + t.name + '" ' +
               'aria-label="Theme: ' + t.name + '">' + dots + '</button>';
      }).join('') +
      '</div>';
    drawer.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-swatch');
      if (!btn) return;
      const id = btn.getAttribute('data-theme-id') || '';
      applyTheme(id);
      saveTheme(id);
      wrap.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  }
  window.applyTheme = applyTheme;

  // ── Init ───────────────────────────────────────────────────
  function init() {
    applyTheme(loadTheme());
    injectFunFact();
    injectThemePicker();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
