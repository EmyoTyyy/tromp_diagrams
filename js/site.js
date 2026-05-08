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
    // Path-aware: from /index.html or /404.html, visualizer is in pages/.
    // From a /pages/ page, it's a sibling.
    const path = window.location.pathname;
    const inPages = /\/pages\//.test(path);
    const base = inPages ? '' : 'pages/';
    // Ω = (\x. x x)(\x. x x)  — the canonical non-terminating term.
    const url = base + 'visualizer.html?expr=' + encodeURIComponent('(\\x. x x)(\\x. x x)') + '&konami=1';
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

  // ── Init ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFunFact);
  } else {
    injectFunFact();
  }
})();
