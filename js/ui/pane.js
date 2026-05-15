// ═══════════════════════════════════════
// PANE — one independent visualizer instance
// ═══════════════════════════════════════

let __paneCounter = 0;
const ALL_PANES = [];

const STEP_DUR = 1200;
const RUN_DUR = 400;
const RUN_INTERVAL = 420;

// Compact human-readable duration. <1ms shows "<1ms"; <100ms keeps a decimal
// for low-resolution timing; <1s shows whole ms; ≥1s shows seconds with 2 dp.
function formatDuration(ms) {
  if (ms < 1) return '<1ms';
  if (ms < 100) return ms.toFixed(1) + 'ms';
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

class Pane {
  constructor(host, opts = {}) {
    this.id = ++__paneCounter;
    this.title = opts.title || ('Pane ' + this.id);
    this.host = host;

    // ── State ──
    this.currentAST = null;
    this.originalAST = null;
    this.stepCount = 0;
    this.runToken = 0;
    this.stepHistory = [];
    this.isPaused = false;
    this.isRunning = false;
    this.isRecording = false;
    this.recordedFrames = [];
    this.recordStartTime = 0;
    // Cumulative wall-clock time the user has been running this pane
    // since the last draw / reset — measured edge-to-edge of every
    // step() / run() call (animations, intervals, the lot), not just
    // the reducer's CPU time. Pause time is excluded by snapshotting
    // the elapsed before pausing and resuming the timer on unpause.
    this.totalElapsed = 0;

    // Per-pane viewport
    this.viewZoom = 1;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;

    // Per-pane toggles
    this.blcVisible = false;
    this.recogVisible = false;

    // DOM ids (must be unique per pane)
    this.idPrefix = 'p' + this.id + '_';
    this.svgId = this.idPrefix + 'svg';
    this.segsId = this.idPrefix + 'segs';
    this.zonesId = this.idPrefix + 'zones';
    this.viewportId = this.idPrefix + 'viewport';

    this._buildDOM();
    this._wire();
    ALL_PANES.push(this);
  }

  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'pane';
    root.dataset.paneId = this.id;
    this.root = root;

    // Header (title + strategy + fold/close — strategy lives here so the
    // reduce row only carries actual step controls).
    root.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">${this.title}</span>
        <div class="pane-actions">
          <button class="pane-fold tt" data-tt="Fold long λ-bodies" data-tt-pos="below" title="Fold all">⌄</button>
          <button class="pane-fold tt" data-tt="Unfold all" data-tt-pos="below" title="Unfold all">⌃</button>
          <button class="pane-close tt" data-tt="Close pane" data-tt-pos="below" title="Close">×</button>
        </div>
      </div>
      <div class="ir">
        <div class="editor-wrap">
          <div class="autocomplete-list"></div>
        </div>
        <button class="btn-sec btn tt" data-tt="Recent expressions" data-tt-pos="below" data-act="history">⟲</button>
        <button class="btn tt" data-tt="Parse and visualize (Ctrl+Enter)" data-tt-pos="below" data-act="draw">Draw</button>
      </div>
      <div class="input-error"></div>
      <div class="find-bar">
        <input type="text" class="find-input" placeholder="find..." />
        <input type="text" class="replace-input" placeholder="replace with..." />
        <span class="count find-count"></span>
        <button class="btn-sec btn" data-act="replaceOne">Replace</button>
        <button class="btn-sec btn" data-act="replaceAll">Replace all</button>
        <button class="btn-sec btn" data-act="closeFind">✕</button>
      </div>
      <div class="ctrl-bar">
        <select class="strat-sel tt" data-tt="Reduction strategy">
          <option value="normal">normal order</option>
          <option value="applicative">applicative</option>
          <option value="cbn">call-by-name</option>
          <option value="cbv">call-by-value</option>
        </select>
        <span class="ctrl-sep"></span>
        <button class="btn btn-sec tt" data-tt="Undo last step" data-act="back" disabled>◀</button>
        <button class="btn btn-sec tt" data-tt="Single β-reduction" data-act="step">Step ▶</button>
        <button class="btn btn-sec tt" data-tt="Run / pause / resume" data-act="run">Run</button>
        <button class="btn btn-sec tt" data-tt="Run a fixed number of steps" data-act="runN">Run N</button>
        <button class="btn btn-sec tt" data-tt="Reset to initial expression" data-act="reset">Reset</button>
        <span class="ctrl-sep"></span>
        <label class="ctrl-max tt" data-tt="Max steps (blank = ∞)">
          max <input type="text" class="max-steps" value="1000" />
        </label>
        <span class="ctrl-sep"></span>
        <button class="btn btn-toggle tt" data-tt="Binary Lambda Calculus encoding" data-act="blc">BLC</button>
        <button class="btn btn-toggle tt" data-tt="Detect known terms" data-act="recog">Recognize</button>
        <span class="ctrl-icons">
          <button class="icon-btn tt" data-tt="Find &amp; replace (Ctrl+F)" data-act="find" aria-label="Find">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="7" cy="7" r="4.5"/>
              <line x1="10.4" y1="10.4" x2="13.5" y2="13.5"/>
            </svg>
          </button>
          <button class="icon-btn tt" data-tt="Copy expression" data-act="copy" aria-label="Copy">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1"/>
              <path d="M2.5 10.5V3a.5.5 0 0 1 .5-.5h7.5"/>
            </svg>
          </button>
          <button class="icon-btn tt" data-tt="Get a shareable URL" data-act="share" aria-label="Share">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h4v4"/>
              <line x1="13" y1="3" x2="7.5" y2="8.5"/>
              <path d="M10.5 9v3.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V5.5a.5.5 0 0 1 .5-.5H7"/>
            </svg>
          </button>
          <button class="icon-btn tt" data-tt="Export PNG" data-act="png" aria-label="PNG">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2.5" y="3" width="11" height="10" rx="1"/>
              <circle cx="6" cy="6.8" r="1"/>
              <path d="M3 12.5L6.5 9l2.2 2.2L12 8l1.5 1.5"/>
            </svg>
          </button>
          <button class="icon-btn tt" data-tt="Record reduction as video" data-act="rec" aria-label="Record">
            <svg viewBox="0 0 16 16" fill="currentColor" stroke="none">
              <circle cx="8" cy="8" r="4"/>
            </svg>
          </button>
        </span>
        <span class="status">step 0</span>
      </div>
      <div class="code-display code-out"></div>
      <div class="code-display recog-out" style="display:none; font-size:0.78rem; color:var(--accent-2); word-break:break-all;"></div>
      <div class="code-display blc-out" style="display:none; font-size:0.78rem; color:var(--muted); word-break:break-all; white-space:pre-wrap;"></div>
      <div class="dw">
        <button class="fs-btn tt" data-tt="Fullscreen this pane" data-tt-pos="below" data-act="fs">⛶</button>
        <div class="zoom-controls">
          <button class="zoom-btn tt" data-tt="Zoom out" data-act="zoomOut">−</button>
          <span class="zoom-level">100%</span>
          <button class="zoom-btn tt" data-tt="Zoom in" data-act="zoomIn">+</button>
          <button class="zoom-btn tt" data-tt="Reset view" data-act="resetView">⊙</button>
        </div>
        <svg id="${this.svgId}" xmlns="http://www.w3.org/2000/svg" width="0" height="0">
          <rect width="100%" height="100%" fill="#0a0a12"/>
          <g id="${this.viewportId}">
            <g id="${this.segsId}"></g>
            <g id="${this.zonesId}"></g>
          </g>
        </svg>
      </div>
    `;

    this.host.appendChild(root);

    // Refs
    this.editorWrap = root.querySelector('.editor-wrap');
    this.errEl = root.querySelector('.input-error');
    this.acList = root.querySelector('.autocomplete-list');
    this.codeEl = root.querySelector('.code-out');
    this.recogEl = root.querySelector('.recog-out');
    this.blcEl = root.querySelector('.blc-out');
    this.statusEl = root.querySelector('.status');
    this.dwEl = root.querySelector('.dw');
    // Must select by id — the icon buttons (find / copy / share / png /
    // rec) are <svg> elements too and come before the diagram in the DOM,
    // so a bare querySelector('svg') would return the first icon.
    this.svgEl = root.querySelector('#' + this.svgId);
    this.viewportEl = root.querySelector('#' + this.viewportId);
    this.zoomLevelEl = root.querySelector('.zoom-level');
    this.findBar = root.querySelector('.find-bar');
    this.findInput = root.querySelector('.find-input');
    this.replaceInput = root.querySelector('.replace-input');
    this.findCountEl = root.querySelector('.find-count');
    this.maxStepsInput = root.querySelector('.max-steps');
    this.stratSel = root.querySelector('.strat-sel');
    this.recordBtn = root.querySelector('[data-act="rec"]');

    // History dropdown (created lazily)
    this.historyPop = null;

    // Editor
    this.editor = new FoldableEditor(this.editorWrap, {
      placeholder: 'Enter λ-expression... (let x = e1 in e2  also accepted)',
    });
  }

  _wire() {
    const r = this.root;
    r.querySelector('[data-act="draw"]').addEventListener('click', () => this.draw());
    r.querySelector('[data-act="history"]').addEventListener('click', (e) => this.toggleHistory(e.currentTarget));
    r.querySelector('[data-act="back"]').addEventListener('click', () => this.stepBack());
    r.querySelector('[data-act="step"]').addEventListener('click', () => this.step());
    r.querySelector('[data-act="run"]').addEventListener('click', () => this.run());
    r.querySelector('[data-act="runN"]').addEventListener('click', () => this.runN());
    r.querySelector('[data-act="reset"]').addEventListener('click', () => this.reset());
    r.querySelector('[data-act="blc"]').addEventListener('click', (e) => this.toggleBLC(e.currentTarget));
    r.querySelector('[data-act="recog"]').addEventListener('click', (e) => this.toggleRecog(e.currentTarget));
    r.querySelector('[data-act="find"]').addEventListener('click', () => this.toggleFind());
    r.querySelector('[data-act="closeFind"]').addEventListener('click', () => this.toggleFind(false));
    r.querySelector('[data-act="replaceOne"]').addEventListener('click', () => this.findReplace(false));
    r.querySelector('[data-act="replaceAll"]').addEventListener('click', () => this.findReplace(true));
    r.querySelector('[data-act="copy"]').addEventListener('click', () => this.copyCode());
    r.querySelector('[data-act="share"]').addEventListener('click', () => this.share());
    r.querySelector('[data-act="png"]').addEventListener('click', () => this.exportPNG());
    r.querySelector('[data-act="rec"]').addEventListener('click', () => this.toggleRecording());
    r.querySelector('[data-act="fs"]').addEventListener('click', () => this.toggleFullscreen());
    r.querySelector('[data-act="zoomIn"]').addEventListener('click', () => this.zoomBy(1.25));
    r.querySelector('[data-act="zoomOut"]').addEventListener('click', () => this.zoomBy(0.8));
    r.querySelector('[data-act="resetView"]').addEventListener('click', () => this.resetView());
    r.querySelector('.pane-close').addEventListener('click', () => this.close());
    r.querySelector('.pane-fold[title="Fold all"]').addEventListener('click', () => this.editor.collapseAll());
    r.querySelector('.pane-fold[title="Unfold all"]').addEventListener('click', () => this.editor.expandAll());
    this.stratSel.addEventListener('change', () => this.reset());

    // Editor events
    this.editor.onInput(() => {
      this._currentInput = this.editor;
      activePane = this;
      updateAutocompleteFor(this);
      this.validate();
    });
    this.editor.onEnter(() => this.draw());

    // Focus tracking — but DON'T auto-open autocomplete here. Refocus
    // happens after almost every action (Draw, Step, Run…) and reopening
    // the suggestions list every time was disruptive.
    this.editor.el.addEventListener('focus', () => {
      activePane = this;
      this._currentInput = this.editor;
      this.markFocused();
    });

    // Set up zoom/pan on this pane's diagram window
    this._setupZoomPan();

    // Find input
    this.findInput.addEventListener('input', () => this.updateFindCount());

    // Click outside history closes it
    document.addEventListener('click', (e) => {
      if (this.historyPop && this.historyPop.classList.contains('open')) {
        const trigger = r.querySelector('[data-act="history"]');
        if (!this.historyPop.contains(e.target) && !trigger.contains(e.target)) {
          this.historyPop.classList.remove('open');
        }
      }
    });
  }

  markFocused() {
    document.querySelectorAll('.pane.focused').forEach(p => p.classList.remove('focused'));
    this.root.classList.add('focused');
  }

  close() {
    if (ALL_PANES.length === 1) { showToast('Need at least one pane', 'warn'); return; }
    this.runToken++;
    this.isRunning = false;
    const idx = ALL_PANES.indexOf(this);
    if (idx >= 0) ALL_PANES.splice(idx, 1);
    if (activePane === this) activePane = ALL_PANES[0] || null;
    this.root.remove();
  }

  // ── Drawing & reduction ─────────────────────────
  draw() {
    const src = this.editor.getValue().trim();
    if (!src) return;
    // Close the autocomplete dropdown if it was open from a half-typed
    // word — clicking Draw is an explicit "I'm done typing" signal.
    if (this.acList) this.acList.classList.remove('open');
    this.runToken++;
    try {
      const rawAST = parse(src);
      const elaborated = elaborate(rawAST, allDefs());
      this.originalAST = elaborated;
      this.currentAST = cloneKeep(elaborated);
      this.stepCount = 0;
      this.stepHistory = [];
      this.totalElapsed = 0;
      // Clear segs
      const segs = document.getElementById(this.segsId);
      while (segs && segs.firstChild) segs.removeChild(segs.firstChild);
      this.setStatus('step 0');
      pushHistory(src);
      this._render(0, null);
      this.updateBackBtn();
      // Re-render folds when content settles
      this.editor.renderFolds();
    } catch (e) {
      this.codeEl.innerHTML = `<span class="err">Error: ${e.message}</span>`;
    }
  }

  setStatus(text, cls) {
    let display = text;
    if (this.totalElapsed > 0) display = text + ' · ' + formatDuration(this.totalElapsed);
    this.statusEl.textContent = display;
    this.statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  async step() {
    if (!this.currentAST || this.isRunning) return;
    this.runToken++;
    const myToken = this.runToken;
    const wallStart = performance.now();
    const result = doStep(this.currentAST, this._currentStrategy());
    if (!result.reduced) {
      this.totalElapsed += performance.now() - wallStart;
      this.setStatus('normal form (step ' + this.stepCount + ')', 'nf');
      this.updateBackBtn();
      return;
    }
    // Flash the about-to-be-reduced redex on the still-current rendering
    // before swapping in the new AST. Tells the user "this is what I'm
    // about to reduce."
    await this._pulseRedex(result.reducedId);
    if (myToken !== this.runToken) {
      this.totalElapsed += performance.now() - wallStart;
      return;
    }
    this.stepHistory.push({ ast: cloneKeep(this.currentAST), stepCount: this.stepCount });
    if (this.stepHistory.length > 500) this.stepHistory.shift();
    this.currentAST = result.node;
    this.stepCount++;
    this.totalElapsed += performance.now() - wallStart;
    this.setStatus('step ' + this.stepCount);
    this._render(STEP_DUR * SPEED_MULT, result.originMap);
    if (this.isRecording) setTimeout(() => this._captureFrame(), STEP_DUR * SPEED_MULT + 30);
    this.updateBackBtn();
  }

  stepBack() {
    if (this.isRunning || !this.stepHistory.length) return;
    this.runToken++;
    const prev = this.stepHistory.pop();
    this.currentAST = prev.ast;
    this.stepCount = prev.stepCount;
    this.setStatus('step ' + this.stepCount + ' (back)');
    this._render(STEP_DUR * SPEED_MULT, null);
    this.updateBackBtn();
  }

  reset() {
    if (!this.originalAST) return;
    this.runToken++;
    this.currentAST = cloneKeep(this.originalAST);
    this.stepCount = 0;
    this.stepHistory = [];
    this.totalElapsed = 0;
    this.setStatus('step 0');
    this._render(STEP_DUR * SPEED_MULT, null);
    this.updateBackBtn();
  }

  async run(opts = {}) {
    if (!this.currentAST) return;
    // The Run button doubles as Pause/Resume — clicking it while a run is
    // already in progress just toggles the pause state instead of being a
    // no-op (and instead of swapping out the button for a separate one).
    if (this.isRunning) { this.togglePause(); return; }
    const myToken = ++this.runToken;
    const strat = this._currentStrategy();
    const startStep = this.stepCount;
    this.isRunning = true;
    this.isPaused = false;
    const runBtn = this.root.querySelector('[data-act="run"]');
    runBtn.textContent = 'Pause';
    this.setStatus('running... step ' + this.stepCount, 'running');
    this.updateBackBtn();

    const maxIn = this.maxStepsInput.value.trim();
    let maxSteps;
    if (opts.nSteps !== undefined) maxSteps = opts.nSteps;
    else if (maxIn === '' || parseInt(maxIn) === 0) maxSteps = Infinity;
    else maxSteps = parseInt(maxIn);

    const animDur = RUN_DUR * SPEED_MULT;
    const interval = RUN_INTERVAL * SPEED_MULT;
    const batchSize = interval < 20 ? Math.ceil(20 / Math.max(interval, 1)) : 1;
    const runStart = { ast: cloneKeep(this.currentAST), stepCount: startStep };

    // Wall-clock timer for the whole run. We snapshot the user's prior
    // accumulated elapsed and add (now − wallStart) on top each tick;
    // pause time is excluded by recomputing wallStart on every resume.
    const baselineElapsed = this.totalElapsed;
    let wallStart = performance.now();
    const tickElapsed = () => {
      this.totalElapsed = baselineElapsed + (performance.now() - wallStart);
    };

    try {
      while (true) {
        if (myToken !== this.runToken) return;
        if (this.isPaused) {
          tickElapsed();
          this.setStatus('paused at step ' + this.stepCount, 'running');
          // Freeze the elapsed counter while paused: capture how much
          // wall time we'd accumulated so far, then on resume rewind
          // wallStart so the freeze interval doesn't count.
          const frozenElapsed = this.totalElapsed - baselineElapsed;
          while (this.isPaused && myToken === this.runToken) await new Promise(r => setTimeout(r, 100));
          if (myToken !== this.runToken) return;
          wallStart = performance.now() - frozenElapsed;
          this.setStatus('running... step ' + this.stepCount, 'running');
        }
        if (this.stepCount - startStep >= maxSteps) {
          tickElapsed();
          this.setStatus('reached limit (' + this.stepCount + ')', 'max');
          return;
        }
        let lastResult = null;
        let batched = 0;
        for (let b = 0; b < batchSize; b++) {
          const result = doStep(this.currentAST, strat);
          if (!result.reduced) {
            if (batched > 0 && lastResult) this._render(animDur, lastResult.originMap);
            tickElapsed();
            this.setStatus('normal form (step ' + this.stepCount + ')', 'nf');
            return;
          }
          this.currentAST = result.node;
          this.stepCount++;
          batched++;
          lastResult = result;
          if (this.stepCount - startStep >= maxSteps) break;
        }
        tickElapsed();
        this.setStatus('running... step ' + this.stepCount, 'running');
        this._render(animDur, lastResult.originMap);
        if (this.isRecording) setTimeout(() => this._captureFrame(), animDur + 10);
        await new Promise(r => setTimeout(r, Math.max(interval, 4)));
      }
    } finally {
      tickElapsed();
      this.stepHistory.push(runStart);
      if (this.stepHistory.length > 500) this.stepHistory.shift();
      this.isRunning = false;
      this.isPaused = false;
      const runBtn = this.root.querySelector('[data-act="run"]');
      if (runBtn) runBtn.textContent = 'Run';
      this.updateBackBtn();
    }
  }

  runN() {
    const ans = prompt('Run how many steps?', '10');
    if (ans === null) return;
    const n = parseInt(ans);
    if (!Number.isFinite(n) || n <= 0) { showToast('Invalid number', 'warn'); return; }
    this.run({ nSteps: n });
  }

  togglePause() {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
    const runBtn = this.root.querySelector('[data-act="run"]');
    if (runBtn) runBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
  }

  async reduceAtNode(targetId) {
    if (this.isRunning || !this.currentAST) return;
    this.runToken++;
    const myToken = this.runToken;
    const result = reduceAt(this.currentAST, targetId);
    if (!result.reduced) return;
    await this._pulseRedex(result.reducedId);
    if (myToken !== this.runToken) return;
    this.stepHistory.push({ ast: cloneKeep(this.currentAST), stepCount: this.stepCount });
    if (this.stepHistory.length > 500) this.stepHistory.shift();
    this.currentAST = result.node;
    this.stepCount++;
    this.setStatus('step ' + this.stepCount + ' (manual)');
    this._render(STEP_DUR * SPEED_MULT, result.originMap);
    this.updateBackBtn();
  }

  // Briefly flash the lines that make up the about-to-be-reduced redex.
  // Uses the redex zone's pre-computed segIds to find which lines belong
  // to it. Resolves after the CSS animation completes (220ms).
  _pulseRedex(appNodeId) {
    return new Promise(resolve => {
      if (!appNodeId) { resolve(); return; }
      const zone = document.querySelector(`#${this.zonesId} rect[data-app-id="${appNodeId}"]`);
      if (!zone) { resolve(); return; }
      const segIds = (zone.dataset.segIds || '').split(',').filter(Boolean);
      const lines = segIds
        .map(sid => document.querySelector(`#${this.segsId} line[data-segid="${sid}"]`))
        .filter(Boolean);
      if (!lines.length) { resolve(); return; }
      // Reset any in-flight animation so a rapid second click re-fires cleanly.
      for (const l of lines) l.classList.remove('redex-flash');
      void document.body.offsetWidth; // force reflow
      for (const l of lines) l.classList.add('redex-flash');
      setTimeout(() => {
        for (const l of lines) l.classList.remove('redex-flash');
        resolve();
      }, 220);
    });
  }

  updateBackBtn() {
    const btn = this.root.querySelector('[data-act="back"]');
    if (btn) btn.disabled = this.stepHistory.length === 0 || this.isRunning;
  }

  _currentStrategy() { return STRATEGIES[this.stratSel.value]; }

  // ── Render ──────────────────────────────────────
  _render(duration, originMap) {
    if (!this.currentAST) return;
    // Code
    assignColors(this.currentAST, {});
    // Render the expression into a scrollable inner element so the copy
    // button (appended to the non-scrolling outer .code-display) stays
    // anchored to the top-right when the user scrolls horizontally
    // through a long expression.
    this.codeEl.innerHTML =
      '<div class="code-inner">' + renderCode(this.currentAST, false, COLOR_MODE) + '</div>';
    if (!this.codeEl.querySelector('.copy-btn')) {
      const cb = document.createElement('button');
      cb.className = 'copy-btn';
      cb.textContent = 'Copy';
      cb.title = 'Copy this expression';
      cb.onclick = (e) => { e.stopPropagation(); this.copyCode(); };
      this.codeEl.appendChild(cb);
    }
    this._wireOccurrenceHover();

    if (this.blcVisible) this._renderBLC();
    if (this.recogVisible) this._renderRecog();

    renderDiagram(this.currentAST, duration, originMap, {
      svgId: this.svgId,
      segsId: this.segsId,
      zonesId: this.zonesId,
      onRedexClick: (e) => this.reduceAtNode(parseInt(e.currentTarget.dataset.appId)),
      skipRedexZones: this.isRunning,
    });
    // In presentation, refit after every render — reduction grows /
    // shrinks the diagram and without this the user can lose half of
    // it off the bottom or right edge. We use rAF so the new SVG
    // width/height (just set as attributes by renderDiagram) have
    // taken effect before fit recomputes.
    if (typeof inPresentation !== 'undefined' && inPresentation) {
      requestAnimationFrame(() => this.autoFit());
    }
  }

  _renderBLC() {
    if (!this.currentAST) { this.blcEl.textContent = ''; return; }
    const blc = toBLC(this.currentAST);
    if (blc === null) {
      this.blcEl.innerHTML = '<span style="color:var(--muted)">BLC: free variables (not closed)</span>';
      return;
    }
    this.blcEl.innerHTML = `<span style="color:#888">BLC (${blc.length} bits):</span>  <span style="color:var(--text)">${blc}</span>`;
  }

  _renderRecog() {
    if (!this.currentAST) { this.recogEl.textContent = ''; return; }
    try {
      const matches = recognize(this.currentAST);
      if (matches.length === 0) this.recogEl.innerHTML = '<span style="color:var(--muted)">≡ no known equivalence</span>';
      else this.recogEl.innerHTML = '<span style="color:#888">≡</span> <span style="color:var(--accent-2)">' + matches.join(', ') + '</span>';
    } catch { this.recogEl.innerHTML = '<span style="color:var(--muted)">≡ recognition failed</span>'; }
  }

  _wireOccurrenceHover() {
    const occs = this.codeEl.querySelectorAll('.var-occ, .binder');
    for (const el of occs) {
      el.addEventListener('mouseenter', (e) => this._onOccHover(e));
      el.addEventListener('mouseleave', () => this._onOccUnhover());
    }
  }
  _onOccHover(e) {
    const el = e.currentTarget;
    const binderId = el.getAttribute('data-binder') || el.getAttribute('data-binder-id');
    const name = el.getAttribute('data-name');
    if (binderId) {
      this.codeEl.querySelectorAll(`[data-binder="${binderId}"], [data-binder-id="${binderId}"]`)
        .forEach(x => x.classList.add('highlight'));
    } else if (name) {
      this.codeEl.querySelectorAll(`.var-occ.var-free[data-name="${name}"]`)
        .forEach(x => x.classList.add('highlight'));
    }
    if (name) {
      document.querySelectorAll(`#${this.segsId} line[data-varname="${CSS.escape(name)}"]`)
        .forEach(l => l.classList.add('highlighted'));
    }
  }
  _onOccUnhover() {
    this.codeEl.querySelectorAll('.var-occ.highlight, .binder.highlight').forEach(x => x.classList.remove('highlight'));
    document.querySelectorAll(`#${this.segsId} line.highlighted`).forEach(l => l.classList.remove('highlighted'));
  }

  validate() {
    const src = this.editor.getValue().trim();
    if (!src) { this.errEl.textContent = ''; this.editor.el.classList.remove('invalid'); return; }
    try {
      elaborate(parse(src), allDefs());
      this.errEl.textContent = '';
      this.editor.el.classList.remove('invalid');
    } catch (e) {
      this.editor.el.classList.add('invalid');
      const msg = e.message;
      let suggestion = '';
      const defs = allDefs();
      const KEYWORDS = new Set(['let', 'in']);
      const words = src.match(/[a-zA-Z_][a-zA-Z0-9_']*/g) || [];
      const known = new Set(Object.keys(defs));
      for (const w of words) {
        if (/^\d+$/.test(w) || known.has(w) || KEYWORDS.has(w)) continue;
        const cands = Object.keys(defs)
          .map(d => ({ d, dist: levenshtein(w.toLowerCase(), d.toLowerCase()) }))
          .filter(x => x.dist > 0 && x.dist <= Math.min(2, Math.floor(w.length / 2) + 1))
          .sort((a, b) => a.dist - b.dist);
        if (cands.length) { suggestion = ` did you mean "${cands[0].d}"?`; break; }
      }
      this.errEl.textContent = msg + suggestion;
      this.errEl.className = 'input-error' + (suggestion ? ' suggestion' : '');
    }
  }

  // ── Toggles ────────────────────────────────────
  toggleBLC(btn) {
    this.blcVisible = !this.blcVisible;
    btn.classList.toggle('active', this.blcVisible);
    btn.textContent = this.blcVisible ? 'BLC ✓' : 'BLC';
    this.blcEl.style.display = this.blcVisible ? '' : 'none';
    if (this.blcVisible) this._renderBLC();
  }
  toggleRecog(btn) {
    this.recogVisible = !this.recogVisible;
    btn.classList.toggle('active', this.recogVisible);
    btn.textContent = this.recogVisible ? 'Recognize ✓' : 'Recognize';
    this.recogEl.style.display = this.recogVisible ? '' : 'none';
    if (this.recogVisible) this._renderRecog();
  }

  toggleFind(force) {
    const open = force === false ? false : !this.findBar.classList.contains('open');
    this.findBar.classList.toggle('open', open);
    if (open) { this.findInput.focus(); this.updateFindCount(); }
  }
  updateFindCount() {
    const find = this.findInput.value;
    if (!find) { this.findCountEl.textContent = ''; return; }
    const text = this.editor.getValue();
    const count = (text.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    this.findCountEl.textContent = count + ' match' + (count === 1 ? '' : 'es');
  }
  findReplace(all) {
    const find = this.findInput.value;
    if (!find) return;
    const repl = this.replaceInput.value;
    let text = this.editor.getValue();
    if (all) text = text.split(find).join(repl);
    else {
      const idx = text.indexOf(find);
      if (idx === -1) return;
      text = text.slice(0, idx) + repl + text.slice(idx + find.length);
    }
    this.editor.setValue(text);
    this.updateFindCount();
    this.validate();
    this.editor.renderFolds();
  }

  // ── Copy / Share / PNG / Record ───────────────
  copyCode() {
    if (!this.currentAST) { showToast('Nothing to copy', 'warn'); return; }
    const text = renderCodePlain(this.currentAST, false);
    navigator.clipboard.writeText(text).then(() => showToast('Copied', 'ok'))
      .catch(() => prompt('Copy this:', text));
  }
  share() {
    const expr = this.editor.getValue();
    if (!expr.trim()) { showToast('Nothing to share', 'warn'); return; }
    const url = buildShareURL(expr);
    navigator.clipboard.writeText(url).then(() => showToast('URL copied', 'ok'))
      .catch(() => prompt('Share URL:', url));
  }
  async exportPNG() {
    const svg = this.svgEl;
    if (!svg.getAttribute('width') || parseFloat(svg.getAttribute('width')) === 0) {
      showToast('Nothing to export', 'warn'); return;
    }
    try {
      const canvas = await svgToCanvas(svg, 3);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tromp-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) { showToast('Export failed', 'danger'); }
  }
  toggleRecording() {
    if (!this.isRecording) {
      if (!this.currentAST) { showToast('Draw first', 'warn'); return; }
      this.isRecording = true;
      this.recordedFrames = [];
      this.recordStartTime = performance.now();
      this.recordBtn.textContent = '■ Stop';
      this.recordBtn.style.color = '#f08080';
      this.recordBtn.style.borderColor = '#f08080';
      this._captureFrame();
    } else {
      this.isRecording = false;
      this.recordBtn.textContent = '● Rec';
      this.recordBtn.style.color = '';
      this.recordBtn.style.borderColor = '';
      finalizePaneRecording(this);
    }
  }
  async _captureFrame() {
    if (!this.isRecording) return;
    try {
      const canvas = await svgToCanvas(this.svgEl, 1.5);
      this.recordedFrames.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width, height: canvas.height,
        time: performance.now() - this.recordStartTime,
      });
    } catch (e) { console.error(e); }
  }

  // ── Zoom / Pan / Fullscreen ───────────────────
  _setupZoomPan() {
    const dw = this.dwEl;
    dw.addEventListener('wheel', (e) => {
      if (e.target.closest('.zoom-controls') || e.target.closest('.fs-btn')) return;
      // The .dw container has padding around the SVG (and the SVG is
      // flex-centred inside it), so a slice of the diagram window is
      // empty surface-2 space rather than diagram. Wheel events over
      // that empty band should fall through to page scroll — hijacking
      // them just to zoom an off-cursor point would trap the user any
      // time their pointer drifted to the edge of the visualizer.
      const svgRect = this.svgEl.getBoundingClientRect();
      const insideSvg =
        e.clientX >= svgRect.left && e.clientX <= svgRect.right &&
        e.clientY >= svgRect.top  && e.clientY <= svgRect.bottom;
      if (!insideSvg) return;
      e.preventDefault();
      // Convert the cursor position into the SVG's own coordinate system,
      // which is what the viewport <g> transform is applied in. Using the
      // .dw rect would put the focus point in the wrong place when .dw
      // centres the SVG via flex (non-fullscreen layout) — the user would
      // see the diagram drift instead of zooming under the cursor.
      const cx = e.clientX - svgRect.left;
      const cy = e.clientY - svgRect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
      this.zoomBy(factor, cx, cy);
    }, { passive: false });

    let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
    dw.addEventListener('mousedown', (e) => {
      if (e.target.closest('.redex-zone') || e.target.closest('button')) return;
      if (e.button !== 0 && e.button !== 1) return;
      panning = true; sx = e.clientX; sy = e.clientY;
      ox = this.viewOffsetX; oy = this.viewOffsetY;
      dw.classList.add('panning');
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!panning) return;
      this.viewOffsetX = ox + (e.clientX - sx);
      this.viewOffsetY = oy + (e.clientY - sy);
      this._applyViewport();
    });
    window.addEventListener('mouseup', () => {
      if (panning) { panning = false; dw.classList.remove('panning'); }
    });
  }
  _applyViewport() {
    this.viewportEl.setAttribute('transform',
      `translate(${this.viewOffsetX}, ${this.viewOffsetY}) scale(${this.viewZoom})`);
    this.zoomLevelEl.textContent = Math.round(this.viewZoom * 100) + '%';
  }
  zoomBy(factor, cx, cy) {
    // cx/cy are expected to be in the SVG's own coordinate space — the
    // viewport <g> transform lives in that space, so anchoring the zoom
    // there keeps the point under the cursor pinned across the zoom.
    // When called without coordinates (zoom buttons), fall back to the
    // SVG centre.
    const svg = this.svgEl;
    const w = parseFloat(svg.getAttribute('width')) || svg.clientWidth || 0;
    const h = parseFloat(svg.getAttribute('height')) || svg.clientHeight || 0;
    if (cx === undefined) cx = w / 2;
    if (cy === undefined) cy = h / 2;
    const newZ = Math.min(20, Math.max(0.05, this.viewZoom * factor));
    const k = newZ / this.viewZoom;
    this.viewOffsetX = cx - (cx - this.viewOffsetX) * k;
    this.viewOffsetY = cy - (cy - this.viewOffsetY) * k;
    this.viewZoom = newZ;
    this._applyViewport();
  }
  resetView() {
    this.viewZoom = 1;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
    this._applyViewport();
  }
  autoFit() {
    const dw = this.dwEl;
    const svg = this.svgEl;
    const cw = dw.clientWidth, ch = dw.clientHeight;
    if (cw < 50 || ch < 50) { requestAnimationFrame(() => this.autoFit()); return; }
    const sw = parseFloat(svg.getAttribute('width')) || 1;
    const sh = parseFloat(svg.getAttribute('height')) || 1;
    if (sw < 2 || sh < 2) { requestAnimationFrame(() => this.autoFit()); return; }
    const pad = 30;
    const target = Math.min((cw - pad) / sw, (ch - pad) / sh) * 0.95;
    this.viewZoom = Math.max(0.05, Math.min(target, 10));
    if (inPresentation) {
      this.viewOffsetX = (cw - sw * this.viewZoom) / 2;
      this.viewOffsetY = (ch - sh * this.viewZoom) / 2;
    } else if (dw.classList.contains('fullscreen')) {
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
    } else {
      this.viewOffsetX = sw / 2 * (1 - this.viewZoom);
      this.viewOffsetY = sh / 2 * (1 - this.viewZoom);
    }
    this._applyViewport();
  }
  toggleFullscreen() {
    const dw = this.dwEl;
    const wasFs = dw.classList.contains('fullscreen');
    dw.classList.toggle('fullscreen');
    document.body.classList.toggle('has-fullscreen-pane', !wasFs);
    if (!wasFs) setTimeout(() => this.autoFit(), 50);
    else this.resetView();
  }

  // ── History dropdown ──────────────────────────
  toggleHistory(triggerBtn) {
    if (!this.historyPop) {
      this.historyPop = document.createElement('div');
      this.historyPop.className = 'history-pop';
      triggerBtn.parentElement.style.position = 'relative';
      triggerBtn.parentElement.appendChild(this.historyPop);
    }
    if (this.historyPop.classList.contains('open')) {
      this.historyPop.classList.remove('open');
      return;
    }
    this._renderHistoryPop();
    this.historyPop.classList.add('open');
  }
  _renderHistoryPop() {
    this.historyPop.innerHTML = '';
    const items = loadHistory();
    if (items.length === 0) {
      const e = document.createElement('div');
      e.className = 'history-item empty';
      e.textContent = '(empty)';
      this.historyPop.appendChild(e);
      return;
    }
    for (const expr of items) {
      const it = document.createElement('div');
      it.className = 'history-item';
      const tx = document.createElement('span');
      // Use a class instead of inline style so the CSS-side truncation
      // rules (flex/min-width/ellipsis) apply — inline `flex: 1` alone
      // wasn't enough to actually clip a wide expression.
      tx.className = 'history-expr';
      tx.textContent = expr;
      // The full expression is still readable on hover via the native
      // browser title tooltip — useful when several truncated entries
      // share the same visible prefix.
      tx.title = expr;
      tx.onclick = () => {
        this.editor.setValue(expr);
        this.historyPop.classList.remove('open');
        this.draw();
      };
      const del = document.createElement('span');
      del.className = 'del-h'; del.textContent = '✕';
      del.onclick = (e) => { e.stopPropagation(); removeFromHistory(expr); this._renderHistoryPop(); };
      it.appendChild(tx); it.appendChild(del);
      this.historyPop.appendChild(it);
    }
    const clr = document.createElement('div');
    clr.className = 'history-item';
    clr.style.borderTop = '1px solid var(--border)';
    clr.style.color = 'var(--danger)';
    clr.textContent = 'Clear history';
    clr.onclick = () => { if (confirm('Clear all history?')) { clearHistory(); this._renderHistoryPop(); } };
    this.historyPop.appendChild(clr);
  }
}

// ── Multi-pane recording (uses export.js helpers) ─────
async function finalizePaneRecording(pane) {
  if (pane.recordedFrames.length === 0) { showToast('No frames recorded', 'warn'); return; }
  pane.setStatus('encoding video... ' + pane.recordedFrames.length + ' frames', 'running');

  let mw = 0, mh = 0;
  for (const f of pane.recordedFrames) { mw = Math.max(mw, f.width); mh = Math.max(mh, f.height); }
  mw = Math.ceil(mw / 2) * 2; mh = Math.ceil(mh / 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = mw; canvas.height = mh;
  const ctx = canvas.getContext('2d');
  const images = await Promise.all(pane.recordedFrames.map(f => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ img, time: f.time, w: f.width, h: f.height });
    img.onerror = rej;
    img.src = f.dataUrl;
  })));
  const stream = canvas.captureStream(30);
  let mt = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mt)) mt = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mt)) mt = 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mt, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise(resolve => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tromp-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    };
  });
  rec.start();
  for (let i = 0; i < images.length; i++) {
    const cur = images[i], nxt = images[i+1];
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, mw, mh);
    ctx.drawImage(cur.img, (mw - cur.w)/2, (mh - cur.h)/2, cur.w, cur.h);
    const hold = nxt ? Math.max(50, nxt.time - cur.time) : 500;
    await new Promise(r => setTimeout(r, hold));
  }
  rec.stop();
  await done;
  pane.setStatus('video saved', 'nf');
  pane.recordedFrames = [];
}

// ── Active pane bookkeeping ───────────────────────
let activePane = null;

function getActivePane() { return activePane; }
function getAllPanes() { return ALL_PANES.slice(); }
