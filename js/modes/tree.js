// ═══════════════════════════════════════════════════════════════
// TREE MODE — multi-strategy reduction DAG with jelly physics
// ═══════════════════════════════════════════════════════════════
// All four reduction strategies (normal, applicative, cbn, cbv)
// advance in lockstep from the same root expression. When two
// strategies produce different results, the graph branches; when
// they later re-converge to an α-equivalent state, the branches
// merge back into a single node (forming a DAG, not a pure tree).
//
// Layout is driven by a small force-directed simulation so the
// graph naturally settles, and so newly-added nodes can shove
// surrounding nodes outwards in a "soundwave" — giving the tree
// a jelly-like wobble that decays over time.
// ═══════════════════════════════════════════════════════════════

const TREE_STRATS = ['normal', 'applicative', 'cbn', 'cbv'];
const TREE_STRAT_COLORS = {
  normal:      '#a0e0ff',
  applicative: '#80e0a0',
  cbn:         '#ffd066',
  cbv:         '#ff8aa0',
};

// Vignette geometry (in viewport pixels, before zoom).
const TREE_VW = 120;     // vignette width
const TREE_VH = 80;      // vignette height
const TREE_VPAD = 6;     // inner padding inside vignette box

// ─── Physics constants ─────────────────────────────────────────
// Faithful port of the JSX "jelly graph" model: force-based simulation
// where every node carries position / velocity / accumulated forces, and
// each frame we integrate with a clamped dt. The repulsion is strong and
// the springs are soft — the velocity cap keeps the system from
// exploding off-screen when those two extremes get out of hand.
const TREE_MAX_DEPTH      = 80;     // depth cap so divergent terms stop building

// Vignette-derived geometry (NODE_R is the half-diagonal — used as the
// "soft radius" by the Lennard-Jones term and by edge-avoid).
const NODE_W              = TREE_VW;
const NODE_H              = TREE_VH;
const NODE_R              = Math.hypot(NODE_W / 2, NODE_H / 2);

// Pair repulsion: short-range Lennard-Jones spike + medium-range magnetic
// 1/r² + a hard rectangular overlap correction.
const TREE_SIGMA          = NODE_R * 2.55;            // ≈ 184 — proportional to JSX
const TREE_SAFE_D         = NODE_R * 0.85;            // ≈  61 — clamp for the LJ inner branch
const TREE_LJ_K           = 0.018;
const TREE_OVERLAP_MARGIN = 24;                       // padding so contact "feels" before
                                                      // the bounding boxes truly touch
const TREE_OVERLAP_K      = 0.95;

// User-mandated parameters (hardcoded — no UI for these).
const TREE_SPRING         = 0.005;   // edge spring stiffness — soft
const TREE_REPULSION      = 6000;    // magnetic-style repulsion magnitude — strong
const TREE_DAMPING        = 0.95;    // exponential velocity damping (per dt of 1 frame)
const TREE_TEMPERATURE    = 0;       // Brownian noise (off)
const TREE_EDGE_AVOID     = 1.6;     // edge-on-node push-out stiffness (pre-correction
                                     // soft force — the hard positional constraint below
                                     // takes over for actual non-intersection guarantee)

// Spring axis damper (applies along the edge to kill string oscillation).
const TREE_SPRING_DAMP    = 0.018;
const TREE_REST_LEN       = 130;     // edge rest length (≈ one tier of depth)

// ── Hard edge-node non-intersection constraint ─────────────────
// edgeAvoid above is a soft force; this is the geometric guarantee.
// After integration, several Jacobi-style passes literally relocate any
// (node, edge) pair that's within EDGE_NODE_MARGIN of overlap, and damp
// the involved velocities to prevent vibration. Even at low slider values
// or with a fast pointer drag, an edge cannot end the frame inside a
// rectangle — the positional pass simply moves it out.
const EDGE_NODE_MARGIN                       = NODE_R + 34;
const EDGE_NODE_HARD_CONSTRAINT_ITERATIONS   = 4;
const EDGE_NODE_POSITIONAL_CORRECTION        = 0.85;

// Soft "home" pull — the initial spawn position acts as a very gentle
// anchor so nothing drifts off to infinity under the strong repulsion.
const TREE_HOME_PULL_X    = 0.0016;
const TREE_HOME_PULL_Y    = 0.0024;

// Drag: target-following force on the dragged node + heavy axis damping.
const TREE_DRAG_K         = 0.35;
const TREE_DRAG_VDAMP     = 0.7;

// Velocity cap — required by the user since strong repulsion + soft springs
// would otherwise let nodes shoot off-screen on a single bad spawn.
const TREE_MAX_SPEED      = 22;

// dt clamp matching the JSX (in units of 16.67 ms = one 60 Hz frame).
const TREE_DT_MIN         = 0.35;
const TREE_DT_MAX         = 1.8;

// ─── State ──────────────────────────────────────────────────────
let treeNextId = 0;
const treeNodes = new Map();   // id -> node
const treeEdges = [];          // {from, to, strategies: Set, _el}
const treeHeads = {};          // strat -> nodeId (current frontier)
const treeTerminal = {};       // strat -> bool
let treeRootId = null;

let treeView = { x: 0, y: 0, zoom: 1.0 };
let treePanning = null;        // {startX, startY, vx, vy}
let treeDragging = null;       // {nodeId, dx, dy, moved}
let treeRunning = false;
let treeRunTimer = null;
let treeRunSpeed = 3;          // 1..8 (lower = slower)
let treeNeedsRender = true;
let treeFrame = null;
let treeFsNodeId = null;
const treePaths = {};          // strat -> array of nodeIds (root → … → head),
                                // used by hover-highlight in the legend.
let treeMinimapOn = false;
let treeHighlightStrat = null; // currently-hovered strategy name, or null

// ─── DOM refs (set in initTree) ─────────────────────────────────
let treeSVG, treeViewport, treeEdgesG, treeNodesG, treeStatsEl,
    treeEmptyEl, treeCanvasWrap, treeEdgeTip,
    treeMinimap, treeMinimapNodes, treeMinimapEdges, treeMinimapVP;

// ───────────────────────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────────────────────
function initTree() {
  treeSVG          = document.getElementById('treeSVG');
  treeViewport     = document.getElementById('treeViewport');
  treeEdgesG       = document.getElementById('treeEdges');
  treeNodesG       = document.getElementById('treeNodes');
  treeStatsEl      = document.getElementById('treeStats');
  treeEmptyEl      = document.getElementById('treeEmpty');
  treeCanvasWrap   = document.getElementById('treeCanvasWrap');
  treeEdgeTip      = document.getElementById('treeEdgeTip');
  treeMinimap      = document.getElementById('treeMinimap');
  treeMinimapNodes = document.getElementById('treeMinimapNodes');
  treeMinimapEdges = document.getElementById('treeMinimapEdges');
  treeMinimapVP    = document.getElementById('treeMinimapVP');

  // Pan / zoom on the canvas itself
  treeCanvasWrap.addEventListener('wheel', onTreeWheel, { passive: false });
  treeCanvasWrap.addEventListener('mousedown', onTreeMouseDown);
  treeCanvasWrap.addEventListener('dblclick', onTreeCanvasDblclick);
  window.addEventListener('mousemove', onTreeMouseMove);
  window.addEventListener('mouseup', onTreeMouseUp);

  // Minimap interactions: click to recenter the main view there.
  treeMinimap.addEventListener('mousedown', onMinimapMouseDown);

  // Hover-highlight a strategy's path through the DAG.
  for (const el of document.querySelectorAll('.lg-strat')) {
    const strat = el.getAttribute('data-strat');
    el.addEventListener('mouseenter', () => highlightStrategyPath(strat));
    el.addEventListener('mouseleave', () => clearStrategyHighlight());
  }

  // Page-wide keyboard shortcuts (skipped while typing in inputs).
  document.addEventListener('keydown', onTreeKeyDown);

  // Default expression — small and divergent enough to be interesting.
  const exprInput = document.getElementById('treeExpr');
  const params = new URLSearchParams(location.search);
  let initial = '';
  if (params.has('expr')) initial = params.get('expr');
  else if (params.has('b64')) {
    try { initial = decodeURIComponent(escape(atob(params.get('b64')))); } catch {}
  }
  exprInput.value = initial || '(\\x. \\y. y) ((\\z. z z) (\\z. z z)) I';
  exprInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); treeReset(); }
  });

  // Start the render/physics loop.
  loopTree();

  // Auto-build for the default example so the page isn't empty.
  treeReset();
}

// ───────────────────────────────────────────────────────────────
// Build / reset
// ───────────────────────────────────────────────────────────────
function treeReset(forcedAst) {
  let ast;
  if (forcedAst) {
    // Programmatic reset (used by fork-from-here): skip parse & input read.
    ast = forcedAst;
  } else {
    const src = document.getElementById('treeExpr').value.trim();
    if (!src) return;
    try {
      ast = elaborate(parse(src), allDefs());
    } catch (e) {
      treeShowError(e.message || String(e));
      return;
    }
  }

  // Wipe state — and the SVG DOM, otherwise the previous tree's nodes
  // and edges linger as orphans.
  treeNodes.clear();
  treeEdges.length = 0;
  while (treeNodesG.firstChild) treeNodesG.removeChild(treeNodesG.firstChild);
  while (treeEdgesG.firstChild) treeEdgesG.removeChild(treeEdgesG.firstChild);
  for (const s of TREE_STRATS) { treeHeads[s] = null; treeTerminal[s] = false; }
  treeNextId = 0;
  treeRootId = null;
  if (treeRunning) treeToggleRun();
  // Reset the viewport so a brand-new expression starts visible.
  treeView = { x: 0, y: 0, zoom: 1.0 };
  treeFsClose();

  // Place root in the viewport center.
  const rect = treeCanvasWrap.getBoundingClientRect();
  const cx = rect.width / 2 - treeView.x;
  const cy = 80 - treeView.y;
  const root = makeNode(ast, 0, cx, cy);
  treeRootId = root.id;
  // Root is anchored: physics never moves it, so the tree hangs from a
  // fixed top instead of drifting downward as nodes accumulate. Still
  // draggable manually — drag updates position directly, release keeps
  // it pinned (because alwaysPinned stays true).
  root.alwaysPinned = true;
  root.pinned = true;
  for (const s of TREE_STRATS) {
    treeHeads[s] = root.id;
    treePaths[s] = [root.id];   // path tracking for hover-highlight
  }

  // Mark already-normal terminals.
  if (!hasRedex(ast)) {
    for (const s of TREE_STRATS) treeTerminal[s] = true;
  }

  treeEmptyEl.style.display = 'none';
  treeNeedsRender = true;
  updateTreeStats();
}

function treeShowError(msg) {
  treeEmptyEl.style.display = '';
  treeEmptyEl.innerHTML = '<span style="color:#ff8a8a;">Parse error: ' +
    msg.replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])) + '</span>';
}

function makeNode(ast, depth, x, y) {
  const id = treeNextId++;
  const node = {
    id, ast, depth,
    x, y, vx: 0, vy: 0, fx: 0, fy: 0, mass: 1,
    // "Home" position acts as a very weak anchor for the soft gravity term.
    // For the root this is set to the canvas-centre placement; for spawned
    // children it's their initial drop point below the parent.
    homeX: x, homeY: y,
    pinned: false, terminal: false,
    justSpawned: true,             // triggers the spawn-in animation on first build
    _el: null, _vignetteEl: null, _contentEl: null, _dotsEl: null,
  };
  treeNodes.set(id, node);
  return node;
}

// Quick redex check — a closed-form "is there at least one β-redex?"
function hasRedex(n) {
  if (n.t === 'app') {
    if (n.f.t === 'lam') return true;
    return hasRedex(n.f) || hasRedex(n.a);
  }
  if (n.t === 'lam') return hasRedex(n.b);
  return false;
}

// ───────────────────────────────────────────────────────────────
// Step
// ───────────────────────────────────────────────────────────────
function treeStep() {
  if (treeRootId == null) return;
  let advanced = false;

  for (const strat of TREE_STRATS) {
    if (treeTerminal[strat]) continue;
    const head = treeNodes.get(treeHeads[strat]);
    if (!head) continue;
    if (head.depth >= TREE_MAX_DEPTH) { treeTerminal[strat] = true; continue; }

    let result;
    try {
      result = doStep(head.ast, STRATEGIES[strat]);
    } catch (e) {
      treeTerminal[strat] = true;
      continue;
    }
    if (!result.reduced) {
      treeTerminal[strat] = true;
      head.terminal = true;
      continue;
    }

    // Look for a pre-existing α-equivalent node anywhere in the graph
    // (this is what merges branches back together).
    let target = findAlphaEqNode(result.node);
    if (!target) {
      // Spawn close to the parent — just enough x-jitter to break ties
      // when two strategies fork in the same step (so the strong repulsion
      // has a direction to push them in).
      const offset = (Math.random() - 0.5) * 28;
      target = makeNode(result.node, head.depth + 1, head.x + offset, head.y + TREE_REST_LEN);
    }

    // Add or extend the edge from head -> target.
    let edge = treeEdges.find(e => e.from === head.id && e.to === target.id);
    if (!edge) {
      edge = { from: head.id, to: target.id, strategies: new Set(), _el: null };
      treeEdges.push(edge);
    }
    edge.strategies.add(strat);

    treeHeads[strat] = target.id;
    if (treePaths[strat]) treePaths[strat].push(target.id);
    advanced = true;
  }

  treeNeedsRender = true;
  updateTreeStats();

  // If everyone is terminal, stop running.
  if (!advanced && treeRunning) treeToggleRun();
}

function findAlphaEqNode(ast) {
  for (const n of treeNodes.values()) {
    if (alphaEqual(n.ast, ast)) return n;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// Run
// ───────────────────────────────────────────────────────────────
function treeToggleRun() {
  treeRunning = !treeRunning;
  const btn = document.getElementById('treeRunBtn');
  if (treeRunning) {
    btn.textContent = '⏸ Pause';
    scheduleRun();
  } else {
    btn.textContent = '▶ Run';
    if (treeRunTimer) { clearTimeout(treeRunTimer); treeRunTimer = null; }
  }
}

function scheduleRun() {
  // speed 1 → 700ms, speed 8 → 60ms (capped low to avoid layout chaos)
  const ms = Math.round(700 - (treeRunSpeed - 1) * 90);
  treeRunTimer = setTimeout(() => {
    if (!treeRunning) return;
    treeStep();
    if (treeRunning) scheduleRun();
  }, ms);
}

function treeSetSpeed(v) {
  treeRunSpeed = parseInt(v, 10);
}

// ───────────────────────────────────────────────────────────────
// Physics — port of the JSX "jelly graph" model
// ───────────────────────────────────────────────────────────────
//
// Per frame, integrate with a clamped dt (so a momentary fps drop
// doesn't kill stability). The forces, in order of accumulation:
//
//   1. Pair repulsion = magnetic 1/r² + Lennard-Jones short-range +
//      a hard rectangular overlap correction.
//   2. Edge springs — Hooke around REST_LEN, with an axis-aligned
//      damper so plucking an edge doesn't ring forever.
//   3. Edge-on-node avoidance — every edge that's not anchored at n
//      pushes n perpendicular if n strays into a margin around the
//      segment, with the equal-and-opposite reaction distributed
//      onto the two endpoints (weighted by closest endpoint).
//   4. Soft "home" gravity — a very weak pull back to the spawn
//      position so the strong repulsion can't scatter the graph.
//   5. Drag — when a node is held, pull it toward the pointer with
//      a stiff spring and damp its velocity heavily.
//
// Then v += f·dt, v *= damping^dt, |v| capped, x += v·dt.

let treeLastFrameTime = 0;
let treePointerWorld = { x: 0, y: 0 };

function segmentPointDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return { d: Math.hypot(dx, dy), nx: dx, ny: dy, t };
}

function physicsTick(dt) {
  // 0. Reset accumulators.
  for (const n of treeNodes.values()) { n.fx = 0; n.fy = 0; }

  const arr = Array.from(treeNodes.values());

  // 1. Pair repulsion (magnetic + Lennard-Jones + overlap correction).
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d  = Math.hypot(dx, dy) || 0.001;
      const nx = dx / d;
      const ny = dy / d;
      const safeD = Math.max(d, TREE_SAFE_D);
      const sr6   = Math.pow(TREE_SIGMA / safeD, 6);
      const lj    = TREE_LJ_K * (2 * sr6 * sr6 - sr6);
      const magnetic = TREE_REPULSION / (safeD * safeD);
      const overlap  = Math.max(0, NODE_R * 2 - d + TREE_OVERLAP_MARGIN) * TREE_OVERLAP_K;
      const force = magnetic + lj + overlap;
      a.fx -= nx * force; a.fy -= ny * force;
      b.fx += nx * force; b.fy += ny * force;
    }
  }

  // 2. Edge springs (Hooke + axis damper).
  for (const e of treeEdges) {
    const a = treeNodes.get(e.from);
    const b = treeNodes.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.hypot(dx, dy) || 0.001;
    const nx = dx / d;
    const ny = dy / d;
    const stretch = d - TREE_REST_LEN;
    const relV = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    const force = TREE_SPRING * stretch + TREE_SPRING_DAMP * relV;
    a.fx += nx * force; a.fy += ny * force;
    b.fx -= nx * force; b.fy -= ny * force;
  }

  // 3. Edge-on-node avoidance.
  // Whenever the user is actively dragging a node, any (edge, third-node)
  // pair that involves it skips the soft avoid: drag is allowed to glide
  // through edges. Other (edge, third-node) pairs still get the soft push.
  const dragId = treeDragging ? treeDragging.nodeId : null;
  for (const e of treeEdges) {
    const a = treeNodes.get(e.from);
    const b = treeNodes.get(e.to);
    if (!a || !b) continue;
    if (dragId !== null && (a.id === dragId || b.id === dragId)) continue;
    for (const c of arr) {
      if (c.id === e.from || c.id === e.to) continue;
      if (c.id === dragId) continue;
      const hit = segmentPointDistance(c.x, c.y, a.x, a.y, b.x, b.y);
      const margin = EDGE_NODE_MARGIN;
      if (hit.d < margin) {
        const inv = 1 / Math.max(hit.d, 0.001);
        const nx = hit.nx * inv;
        const ny = hit.ny * inv;
        const penetration = margin - hit.d;
        const force = penetration * TREE_EDGE_AVOID;
        const wa = 1 - hit.t;
        const wb = hit.t;
        c.fx += nx * force * 1.5;
        c.fy += ny * force * 1.5;
        a.fx -= nx * force * wa;
        a.fy -= ny * force * wa;
        b.fx -= nx * force * wb;
        b.fy -= ny * force * wb;
      }
    }
  }

  // 4 + 5 + integrate.
  const damp = Math.pow(TREE_DAMPING, dt);
  let kineticTotal = 0;
  for (const n of treeNodes.values()) {
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }

    // Soft home-position gravity (very weak — just enough so strong
    // repulsion can't push everything off into the void).
    n.fx += (n.homeX - n.x) * TREE_HOME_PULL_X;
    n.fy += (n.homeY - n.y) * TREE_HOME_PULL_Y;

    // Brownian noise (off by default — TEMPERATURE = 0).
    if (TREE_TEMPERATURE > 0) {
      n.fx += (Math.random() - 0.5) * TREE_TEMPERATURE;
      n.fy += (Math.random() - 0.5) * TREE_TEMPERATURE;
    }

    // Drag: stiff spring toward pointer + heavy axis damping.
    if (treeDragging && treeDragging.nodeId === n.id) {
      n.fx += (treePointerWorld.x - n.x) * TREE_DRAG_K;
      n.fy += (treePointerWorld.y - n.y) * TREE_DRAG_K;
      n.vx *= TREE_DRAG_VDAMP;
      n.vy *= TREE_DRAG_VDAMP;
    }

    // Symplectic-Euler integration with exponential damping.
    n.vx = (n.vx + (n.fx / n.mass) * dt) * damp;
    n.vy = (n.vy + (n.fy / n.mass) * dt) * damp;

    // Required velocity cap — strong repulsion + soft springs would
    // otherwise let a freshly-spawned overlap fling a node off-screen.
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > TREE_MAX_SPEED) {
      n.vx = (n.vx / speed) * TREE_MAX_SPEED;
      n.vy = (n.vy / speed) * TREE_MAX_SPEED;
    }

    n.x += n.vx * dt;
    n.y += n.vy * dt;
    kineticTotal += n.vx * n.vx + n.vy * n.vy;
  }

  // Hard non-intersection pass — guarantees no edge ends a frame inside
  // a node, regardless of slider value, dt, or how violently the user
  // drags. Done AFTER integration so it operates on final-positions of
  // the frame.
  resolveEdgeNodeConstraints();

  return kineticTotal;
}

// Geometric (positional) resolution of edge-node intersection.
// Several Jacobi passes: each pass finds (edge, third-node) pairs whose
// distance is below the safety margin, and immediately translates the
// node out of the forbidden region while pulling the edge endpoints in
// the opposite direction (weighted by where along the segment the
// contact happened). Velocities of the involved bodies are then damped
// to prevent the next frame from re-launching them into each other.
//
// This is a "hard" constraint in the sense of position-based dynamics:
// it doesn't add a force, it directly fixes the geometry.  edgeAvoid
// upstream is still useful — it nudges things gently before they ever
// reach the forbidden zone — but this pass is the actual non-overlap
// guarantee.
function resolveEdgeNodeConstraints() {
  const arr = Array.from(treeNodes.values());
  // While the user is actively dragging a node, the constraint is
  // disabled for any (edge, third-node) pair that involves it — the
  // drag is intentionally allowed to glide a node across edges. Pairs
  // that don't involve the dragged node still get corrected, so the
  // rest of the tree continues to enforce non-intersection.
  const dragId = treeDragging ? treeDragging.nodeId : null;
  for (let iter = 0; iter < EDGE_NODE_HARD_CONSTRAINT_ITERATIONS; iter++) {
    for (const e of treeEdges) {
      const a = treeNodes.get(e.from);
      const b = treeNodes.get(e.to);
      if (!a || !b) continue;
      if (dragId !== null && (a.id === dragId || b.id === dragId)) continue;
      for (const c of arr) {
        if (c.id === a.id || c.id === b.id) continue;
        if (c.id === dragId) continue;
        const hit = segmentPointDistance(c.x, c.y, a.x, a.y, b.x, b.y);
        if (hit.d >= EDGE_NODE_MARGIN) continue;

        // Direction from segment-closest-point to the offending node.
        // If the node is exactly on the segment (d ≈ 0), pick the
        // segment's left perpendicular so we still have a direction.
        let ux, uy;
        if (hit.d < 0.001) {
          const sx = b.x - a.x;
          const sy = b.y - a.y;
          const sl = Math.hypot(sx, sy) || 1;
          ux = -sy / sl;
          uy =  sx / sl;
        } else {
          ux = hit.nx / hit.d;
          uy = hit.ny / hit.d;
        }
        const penetration = EDGE_NODE_MARGIN - hit.d;
        const corr = penetration * EDGE_NODE_POSITIONAL_CORRECTION;
        const wa = 1 - hit.t;
        const wb = hit.t;

        // Translate. Pinned bodies don't move (their share of the
        // correction is silently dropped — the unpinned counterparts
        // will absorb the rest over the iterations).
        if (!c.pinned) {
          c.x += ux * corr;
          c.y += uy * corr;
          c.vx *= 0.75;
          c.vy *= 0.75;
        }
        if (!a.pinned) {
          a.x -= ux * corr * wa;
          a.y -= uy * corr * wa;
          a.vx *= 0.85;
          a.vy *= 0.85;
        }
        if (!b.pinned) {
          b.x -= ux * corr * wb;
          b.y -= uy * corr * wb;
          b.vx *= 0.85;
          b.vy *= 0.85;
        }
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────
// Render loop — one physics step per rAF, with clamped dt.
// ───────────────────────────────────────────────────────────────
function loopTree(now) {
  if (!treeLastFrameTime) treeLastFrameTime = now || performance.now();
  const t = now || performance.now();
  let dt = (t - treeLastFrameTime) / 16.667;
  if (!isFinite(dt) || dt < TREE_DT_MIN) dt = TREE_DT_MIN;
  if (dt > TREE_DT_MAX) dt = TREE_DT_MAX;
  treeLastFrameTime = t;

  const k = physicsTick(dt);
  if (k > 0.0001 || treeNeedsRender) {
    renderTree();
    treeNeedsRender = false;
  }
  treeFrame = requestAnimationFrame(loopTree);
}

function renderTree() {
  // 1. Viewport transform
  treeViewport.setAttribute('transform',
    `translate(${treeView.x} ${treeView.y}) scale(${treeView.zoom})`);

  // 2. Reconcile nodes
  const seenNodes = new Set();
  for (const n of treeNodes.values()) {
    seenNodes.add(n.id);
    if (!n._el) {
      n._el = buildNodeElement(n);
      treeNodesG.appendChild(n._el);
    }
    // Position
    n._el.setAttribute('transform', `translate(${n.x} ${n.y})`);
    // Update strategy-head dots
    updateStrategyDots(n);
    // Update terminal styling
    n._el.classList.toggle('terminal', n.terminal);
  }
  // Remove stale (none expected, but defensive).
  for (const child of Array.from(treeNodesG.children)) {
    const id = parseInt(child.getAttribute('data-id'), 10);
    if (!seenNodes.has(id)) child.remove();
  }

  // 3. Reconcile edges
  for (const e of treeEdges) {
    if (!e._el) {
      e._el = buildEdgeElement(e);
      treeEdgesG.appendChild(e._el);
    }
    const a = treeNodes.get(e.from);
    const b = treeNodes.get(e.to);
    if (!a || !b) continue;
    const x1 = a.x, y1 = a.y + TREE_VH / 2;
    const x2 = b.x, y2 = b.y - TREE_VH / 2;
    // Cubic Bezier for a soft S-curve.
    const cy = (y1 + y2) / 2;
    const d = `M ${x1} ${y1} C ${x1} ${cy} ${x2} ${cy} ${x2} ${y2}`;
    e._el.setAttribute('d', d);
    // Update color stops if strategy set changed
    paintEdge(e);
  }

  // 4. If a strategy hover-highlight is active, re-apply its classes
  //    (new nodes/edges may have been built this render). Cheap because
  //    we just toggle existing class names.
  if (treeHighlightStrat) highlightStrategyPath(treeHighlightStrat);

  // 5. Minimap mirrors the main canvas — only repaint when visible.
  if (treeMinimapOn) renderMinimap();
}

// ── Node element ─────────────────────────────────────────────
function buildNodeElement(n) {
  const SVG = 'http://www.w3.org/2000/svg';
  // Outer group holds the translate transform (managed by physics).
  // The inner `tn-content` group is what the spawn-in animation scales —
  // doing it on the outer group would fight with the per-frame translate.
  const g = document.createElementNS(SVG, 'g');
  g.classList.add('tn');
  g.setAttribute('data-id', n.id);

  const content = document.createElementNS(SVG, 'g');
  content.setAttribute('class', 'tn-content');
  g.appendChild(content);
  n._contentEl = content;

  const rect = document.createElementNS(SVG, 'rect');
  rect.setAttribute('class', 'tn-bg');
  rect.setAttribute('x', -TREE_VW / 2);
  rect.setAttribute('y', -TREE_VH / 2);
  rect.setAttribute('width', TREE_VW);
  rect.setAttribute('height', TREE_VH);
  rect.setAttribute('rx', 4);
  content.appendChild(rect);

  // Inner SVG holds the diagram, fitted via viewBox.
  const inner = document.createElementNS(SVG, 'svg');
  inner.setAttribute('class', 'tn-inner');
  inner.setAttribute('x', -TREE_VW / 2 + TREE_VPAD);
  inner.setAttribute('y', -TREE_VH / 2 + TREE_VPAD);
  inner.setAttribute('width', TREE_VW - 2 * TREE_VPAD);
  inner.setAttribute('height', TREE_VH - 2 * TREE_VPAD);
  inner.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  drawVignette(inner, n.ast);
  content.appendChild(inner);
  n._vignetteEl = inner;

  // Depth badge
  const depth = document.createElementNS(SVG, 'text');
  depth.setAttribute('class', 'tn-depth');
  depth.setAttribute('x', -TREE_VW / 2 + 4);
  depth.setAttribute('y', -TREE_VH / 2 + 11);
  depth.textContent = 'd' + n.depth;
  content.appendChild(depth);

  // Strategy head dots (filled in by updateStrategyDots)
  const dotsG = document.createElementNS(SVG, 'g');
  dotsG.setAttribute('class', 'tn-dots');
  content.appendChild(dotsG);
  n._dotsEl = dotsG;

  // Spawn-in animation: scale-up + fade. Runs once on the just-spawned
  // node; the class is removed after the animation completes so it
  // doesn't fire again when the element is later restyled.
  if (n.justSpawned) {
    content.classList.add('spawning');
    setTimeout(() => content.classList.remove('spawning'), 280);
    n.justSpawned = false;
  }

  // Pointer events
  g.addEventListener('mousedown', (ev) => onNodeMouseDown(ev, n));

  return g;
}

function updateStrategyDots(n) {
  const SVG = 'http://www.w3.org/2000/svg';
  // Which strategies have their head here?
  const here = TREE_STRATS.filter(s => treeHeads[s] === n.id);
  // Clear & rebuild (small, fast).
  while (n._dotsEl.firstChild) n._dotsEl.removeChild(n._dotsEl.firstChild);
  here.forEach((s, i) => {
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', TREE_VW / 2 - 8 - i * 11);
    dot.setAttribute('cy', -TREE_VH / 2 + 8);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', TREE_STRAT_COLORS[s]);
    dot.setAttribute('class', 'tn-dot' + (treeTerminal[s] ? ' terminal' : ''));
    const t = document.createElementNS(SVG, 'title');
    t.textContent = s + (treeTerminal[s] ? ' (normal form)' : '');
    dot.appendChild(t);
    n._dotsEl.appendChild(dot);
  });
}

// ── Vignette: re-uses computeDiagram but draws statically ──
function drawVignette(svgEl, ast) {
  const { segs, gridW, gridH } = computeDiagram(ast);
  const PAD = 2;
  const W = gridW + PAD * 2;
  const H = gridH + PAD * 2;
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // Stroke width relative to grid units so the diagram reads at any size.
  const sw = Math.max(0.45, Math.min(gridW, gridH) * 0.06);
  const NS = 'http://www.w3.org/2000/svg';
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  for (const s of segs) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', PAD + s.x1);
    ln.setAttribute('y1', PAD + s.y1);
    ln.setAttribute('x2', PAD + s.x2);
    ln.setAttribute('y2', PAD + s.y2);
    ln.setAttribute('stroke', '#ffffff');
    ln.setAttribute('stroke-width', sw);
    ln.setAttribute('stroke-linecap', s.kind === 'V' ? 'butt' : 'square');
    svgEl.appendChild(ln);
  }
}

// ── Edge element ─────────────────────────────────────────────
function buildEdgeElement(e) {
  const SVG = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('class', 'te');
  path.setAttribute('fill', 'none');
  path.addEventListener('mouseenter', (ev) => showEdgeTip(ev, e));
  path.addEventListener('mousemove',  (ev) => showEdgeTip(ev, e));
  path.addEventListener('mouseleave', () => hideEdgeTip());
  return path;
}

function paintEdge(e) {
  const strats = Array.from(e.strategies);
  // If a single strategy → solid color.  Multiple → blend by stacking
  // semi-transparent strokes.  Easier: just pick the first colour and
  // make the line thicker the more strategies share it.
  const baseColor = strats.length === 1
    ? TREE_STRAT_COLORS[strats[0]]
    : '#cfd8e0';                                      // mixed → neutral
  const w = 1.2 + strats.length * 0.6;
  e._el.setAttribute('stroke', baseColor);
  e._el.setAttribute('stroke-width', w);
  e._el.setAttribute('stroke-opacity', strats.length === 1 ? 0.85 : 0.95);
  e._el.classList.toggle('multi', strats.length > 1);
}

function showEdgeTip(ev, e) {
  const strats = Array.from(e.strategies);
  treeEdgeTip.textContent = strats.join(', ');
  treeEdgeTip.style.display = 'block';
  const rect = treeCanvasWrap.getBoundingClientRect();
  treeEdgeTip.style.left = (ev.clientX - rect.left + 12) + 'px';
  treeEdgeTip.style.top  = (ev.clientY - rect.top  + 12) + 'px';
}
function hideEdgeTip() {
  treeEdgeTip.style.display = 'none';
}

// ───────────────────────────────────────────────────────────────
// Pan / zoom / drag
// ───────────────────────────────────────────────────────────────
function onTreeWheel(ev) {
  ev.preventDefault();
  const rect = treeCanvasWrap.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  treeZoomAt(mx, my, factor);
}

function treeZoomAt(mx, my, factor) {
  const before = { x: (mx - treeView.x) / treeView.zoom, y: (my - treeView.y) / treeView.zoom };
  treeView.zoom = clamp(treeView.zoom * factor, 0.15, 3);
  treeView.x = mx - before.x * treeView.zoom;
  treeView.y = my - before.y * treeView.zoom;
  treeNeedsRender = true;
}

function treeZoomBy(f) {
  const rect = treeCanvasWrap.getBoundingClientRect();
  treeZoomAt(rect.width / 2, rect.height / 2, f);
}

function treeFit() {
  if (treeNodes.size === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of treeNodes.values()) {
    minX = Math.min(minX, n.x - TREE_VW / 2);
    maxX = Math.max(maxX, n.x + TREE_VW / 2);
    minY = Math.min(minY, n.y - TREE_VH / 2);
    maxY = Math.max(maxY, n.y + TREE_VH / 2);
  }
  const w = maxX - minX, h = maxY - minY;
  const rect = treeCanvasWrap.getBoundingClientRect();
  const margin = 40;
  const z = Math.min(
    (rect.width  - 2 * margin) / Math.max(w, 1),
    (rect.height - 2 * margin) / Math.max(h, 1),
    2.0
  );
  treeView.zoom = clamp(z, 0.15, 2);
  treeView.x = margin - minX * treeView.zoom +
    (rect.width  - 2 * margin - w * treeView.zoom) / 2;
  treeView.y = margin - minY * treeView.zoom +
    (rect.height - 2 * margin - h * treeView.zoom) / 2;
  treeNeedsRender = true;
}

function onTreeMouseDown(ev) {
  // If the mousedown landed on a node element, the node handler will
  // set treeDragging and stop propagation.
  if (treeDragging) return;
  if (ev.button !== 0) return;
  treePanning = {
    startX: ev.clientX, startY: ev.clientY,
    vx: treeView.x, vy: treeView.y,
  };
}

function clientToWorld(ev) {
  const rect = treeCanvasWrap.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left - treeView.x) / treeView.zoom,
    y: (ev.clientY - rect.top  - treeView.y) / treeView.zoom,
  };
}

function onNodeMouseDown(ev, n) {
  if (ev.button !== 0) return;
  ev.stopPropagation();
  // Force-based drag: just record the pointer; the physics step
  // applies a stiff spring from the node to the pointer each tick,
  // so the node lags slightly behind, which reads as elastic.
  const w = clientToWorld(ev);
  treePointerWorld.x = w.x;
  treePointerWorld.y = w.y;
  treeDragging = {
    nodeId: n.id,
    wasPinned: n.pinned,                // restore on release (root reattaches)
    moved: false,
    startMX: ev.clientX,
    startMY: ev.clientY,
  };
  // Always allow integration while dragging — including for the root,
  // so the drag-spring force can actually move it.
  n.pinned = false;
}

function onTreeMouseMove(ev) {
  if (treeDragging) {
    const w = clientToWorld(ev);
    treePointerWorld.x = w.x;
    treePointerWorld.y = w.y;
    const dxs = ev.clientX - treeDragging.startMX;
    const dys = ev.clientY - treeDragging.startMY;
    if (dxs * dxs + dys * dys > 16) treeDragging.moved = true;
    return;
  }
  if (treePanning) {
    treeView.x = treePanning.vx + (ev.clientX - treePanning.startX);
    treeView.y = treePanning.vy + (ev.clientY - treePanning.startY);
    treeNeedsRender = true;
  }
}

function onTreeMouseUp(ev) {
  if (treeDragging) {
    const n = treeNodes.get(treeDragging.nodeId);
    if (n) {
      // Restore pre-drag pinned state. For the root, also re-anchor its
      // "home" to wherever the user dropped it so soft gravity targets
      // the new resting place.
      n.pinned = treeDragging.wasPinned;
      if (n.alwaysPinned) {
        n.homeX = n.x;
        n.homeY = n.y;
      }
      if (!treeDragging.moved) {
        // No drag ever happened ⇒ treat as click → open fullscreen.
        openTreeFs(n.id);
      }
    }
    treeDragging = null;
  }
  treePanning = null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ───────────────────────────────────────────────────────────────
// Stats line
// ───────────────────────────────────────────────────────────────
function updateTreeStats() {
  const n = treeNodes.size;
  const e = treeEdges.length;
  const live = TREE_STRATS.filter(s => !treeTerminal[s]).length;
  treeStatsEl.textContent = `${n} node${n === 1 ? '' : 's'} · ${e} edge${e === 1 ? '' : 's'} · ${live}/4 active`;
}

// ───────────────────────────────────────────────────────────────
// Fullscreen overlay
// ───────────────────────────────────────────────────────────────
function openTreeFs(nodeId) {
  const n = treeNodes.get(nodeId);
  if (!n) return;
  treeFsNodeId = nodeId;

  document.getElementById('treeFsTitle').textContent = 'Step ' + n.depth;

  // Strategy chips (which strategies are at this node)
  const stratsHere = TREE_STRATS.filter(s => treeHeads[s] === nodeId);
  const stratsEl = document.getElementById('treeFsStrats');
  stratsEl.innerHTML = stratsHere.length
    ? stratsHere.map(s =>
        `<span class="tree-fs-chip" style="--c:${TREE_STRAT_COLORS[s]}">${s}${treeTerminal[s] ? ' ✓' : ''}</span>`
      ).join('')
    : '<span style="color:var(--muted); font-size:0.7rem;">(intermediate state)</span>';

  // Big diagram
  const fsSVG = document.getElementById('treeFsSVG');
  const fsSegs = document.getElementById('treeFsSegs');
  while (fsSegs.firstChild) fsSegs.removeChild(fsSegs.firstChild);
  const { segs, gridW, gridH } = computeDiagram(n.ast);
  const FS_SCALE = 14;
  const FS_PAD = 2;
  const W = (gridW + FS_PAD * 2) * FS_SCALE;
  const H = (gridH + FS_PAD * 2) * FS_SCALE;
  fsSVG.setAttribute('width', W);
  fsSVG.setAttribute('height', H);
  fsSVG.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const sw = Math.max(2, FS_SCALE * 0.55);
  const NS = 'http://www.w3.org/2000/svg';
  for (const s of segs) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', (FS_PAD + s.x1) * FS_SCALE);
    ln.setAttribute('y1', (FS_PAD + s.y1) * FS_SCALE);
    ln.setAttribute('x2', (FS_PAD + s.x2) * FS_SCALE);
    ln.setAttribute('y2', (FS_PAD + s.y2) * FS_SCALE);
    ln.setAttribute('stroke', '#ffffff');
    ln.setAttribute('stroke-width', sw);
    ln.setAttribute('stroke-linecap', s.kind === 'V' ? 'butt' : 'square');
    fsSegs.appendChild(ln);
  }

  // Code
  document.getElementById('treeFsCode').textContent = renderCodePlain(n.ast, false);

  document.getElementById('treeFs').classList.add('open');
}

function treeFsClose() {
  document.getElementById('treeFs').classList.remove('open');
  treeFsNodeId = null;
}

function treeFsDownloadSVG() {
  const fsSVG = document.getElementById('treeFsSVG');
  const clone = fsSVG.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Solid background so it's readable on light viewers.
  const NS = 'http://www.w3.org/2000/svg';
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width',  fsSVG.getAttribute('width'));
  bg.setAttribute('height', fsSVG.getAttribute('height'));
  bg.setAttribute('fill', '#101418');
  clone.insertBefore(bg, clone.firstChild);
  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: 'image/svg+xml' });
  triggerDownload(blob, 'tromp-step.svg');
}

function treeFsDownloadPNG() {
  const fsSVG = document.getElementById('treeFsSVG');
  const W = parseInt(fsSVG.getAttribute('width'), 10);
  const H = parseInt(fsSVG.getAttribute('height'), 10);
  const clone = fsSVG.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const NS = 'http://www.w3.org/2000/svg';
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', '#101418');
  clone.insertBefore(bg, clone.firstChild);
  const svgData = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  const img = new Image();
  img.onload = () => {
    const scale = 2;          // 2× for sharper PNG
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => triggerDownload(b, 'tromp-step.png'), 'image/png');
  };
  img.src = url;
}

function treeFsOpenInVisualizer() {
  const n = treeNodes.get(treeFsNodeId);
  if (!n) return;
  const code = renderCodePlain(n.ast, false);
  let url = 'visualizer.html';
  if (code.length < 120) {
    url += '?expr=' + encodeURIComponent(code);
  } else {
    // base64 (UTF-8 safe) for long expressions
    const b64 = btoa(unescape(encodeURIComponent(code)));
    url += '?b64=' + b64;
  }
  window.open(url, '_blank');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ───────────────────────────────────────────────────────────────
// Keyboard shortcuts
// ───────────────────────────────────────────────────────────────
function onTreeKeyDown(ev) {
  // Skip while typing in an input.
  const t = ev.target && ev.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' ||
      (ev.target && ev.target.isContentEditable)) {
    return;
  }
  // While fullscreen overlay is open, only Esc applies.
  const fsOpen = document.getElementById('treeFs')?.classList.contains('open');
  if (fsOpen) {
    if (ev.key === 'Escape') treeFsClose();
    return;
  }
  // While shortcuts modal is open, ?/Esc close it; everything else is ignored.
  const shortcutsOpen = document.getElementById('shortcutsOverlay')?.classList.contains('open');
  if (shortcutsOpen) {
    if (ev.key === 'Escape' || ev.key === '?') {
      ev.preventDefault();
      toggleShortcuts();
    }
    return;
  }
  switch (ev.key) {
    case ' ':
    case 'ArrowRight':
      ev.preventDefault();
      treeStep();
      break;
    case 'r':
    case 'R':
      ev.preventDefault();
      treeToggleRun();
      break;
    case 'f':
    case 'F':
      ev.preventDefault();
      treeFit();
      break;
    case 'm':
    case 'M':
      ev.preventDefault();
      treeToggleMinimap();
      break;
    case '?':
      ev.preventDefault();
      toggleShortcuts();
      break;
    case 'Escape':
      if (treeCanvasWrap.classList.contains('fullscreen')) {
        treeToggleFullscreen();
      } else {
        // Otherwise just drop any hover-highlight.
        clearStrategyHighlight();
      }
      break;
  }
}

function onTreeCanvasDblclick(ev) {
  // Double-click on empty canvas → reset viewport.
  // Ignore if landing on a node or edge element (those have their own
  // semantics).
  if (ev.target.closest('.tn') || ev.target.closest('.te')) return;
  if (ev.target.closest('.tree-minimap')) return;
  treeView = { x: 0, y: 0, zoom: 1.0 };
  treeNeedsRender = true;
}

// ───────────────────────────────────────────────────────────────
// Strategy-path hover highlight
// ───────────────────────────────────────────────────────────────
function highlightStrategyPath(strat) {
  const path = treePaths[strat];
  if (!path || path.length === 0) return;
  treeHighlightStrat = strat;
  treeCanvasWrap.classList.add('path-mode');
  // Set a CSS variable so the path elements render in this strategy's colour.
  treeCanvasWrap.style.setProperty('--path-color', TREE_STRAT_COLORS[strat]);

  // Reset all node/edge classes, then mark the path.
  for (const n of treeNodes.values()) {
    n._el?.classList.remove('path-on');
  }
  for (const e of treeEdges) {
    e._el?.classList.remove('path-on');
  }
  // Mark each visited node.
  const visited = new Set(path);
  for (const id of visited) {
    const n = treeNodes.get(id);
    n?._el?.classList.add('path-on');
  }
  // Mark each consecutive (path[i], path[i+1]) edge.
  for (let i = 0; i + 1 < path.length; i++) {
    const fromId = path[i];
    const toId = path[i + 1];
    const e = treeEdges.find(x => x.from === fromId && x.to === toId);
    e?._el?.classList.add('path-on');
  }
}

function clearStrategyHighlight() {
  treeHighlightStrat = null;
  treeCanvasWrap.classList.remove('path-mode');
  for (const n of treeNodes.values()) n._el?.classList.remove('path-on');
  for (const e of treeEdges) e._el?.classList.remove('path-on');
}

// ───────────────────────────────────────────────────────────────
// Minimap
// ───────────────────────────────────────────────────────────────
// CSS-class-based fullscreen, identical pattern to the visualizer's
// per-pane fullscreen toggle. This keeps document-level keyboard
// shortcuts working (the native Fullscreen API was eating Esc and
// disrupting the keydown listener).
function treeToggleFullscreen() {
  const wrap = treeCanvasWrap;
  const wasFs = wrap.classList.contains('fullscreen');
  wrap.classList.toggle('fullscreen');
  document.body.classList.toggle('has-fullscreen-pane', !wasFs);
  // Re-fit on the next frame: getBoundingClientRect needs the layout
  // to settle before treeFit can compute the new viewport size.
  requestAnimationFrame(() => {
    if (treeNodes.size > 0) treeFit();
    treeNeedsRender = true;
  });
}

function treeToggleMinimap() {
  treeMinimapOn = !treeMinimapOn;
  treeMinimap.style.display = treeMinimapOn ? '' : 'none';
  document.getElementById('treeMinimapBtn')?.classList.toggle('active', treeMinimapOn);
  if (treeMinimapOn) renderMinimap();
}

function renderMinimap() {
  if (!treeMinimapOn || treeNodes.size === 0) return;
  // Bounding box of the whole graph (with vignette extents).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of treeNodes.values()) {
    if (n.x - TREE_VW / 2 < minX) minX = n.x - TREE_VW / 2;
    if (n.x + TREE_VW / 2 > maxX) maxX = n.x + TREE_VW / 2;
    if (n.y - TREE_VH / 2 < minY) minY = n.y - TREE_VH / 2;
    if (n.y + TREE_VH / 2 > maxY) maxY = n.y + TREE_VH / 2;
  }
  const pad = 30;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  treeMinimap.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);

  // Rebuild edges (cheap — straight lines, no Bezier).
  const NS = 'http://www.w3.org/2000/svg';
  while (treeMinimapEdges.firstChild) treeMinimapEdges.removeChild(treeMinimapEdges.firstChild);
  for (const e of treeEdges) {
    const a = treeNodes.get(e.from), b = treeNodes.get(e.to);
    if (!a || !b) continue;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'tm-edge');
    ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
    ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
    treeMinimapEdges.appendChild(ln);
  }
  // Rebuild node dots.
  while (treeMinimapNodes.firstChild) treeMinimapNodes.removeChild(treeMinimapNodes.firstChild);
  for (const n of treeNodes.values()) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'tm-node');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
    c.setAttribute('r', 12);
    treeMinimapNodes.appendChild(c);
  }
  // Viewport rectangle: in world coords, the visible window is
  // [-treeView.x, -treeView.y] to [-treeView.x + W, -treeView.y + H], all /zoom.
  const rect = treeCanvasWrap.getBoundingClientRect();
  const vx = -treeView.x / treeView.zoom;
  const vy = -treeView.y / treeView.zoom;
  const vw = rect.width / treeView.zoom;
  const vh = rect.height / treeView.zoom;
  treeMinimapVP.setAttribute('x', vx);
  treeMinimapVP.setAttribute('y', vy);
  treeMinimapVP.setAttribute('width', vw);
  treeMinimapVP.setAttribute('height', vh);
}

function onMinimapMouseDown(ev) {
  ev.stopPropagation();
  // Convert click point on the minimap (CSS px) to world coords via viewBox.
  const rect = treeMinimap.getBoundingClientRect();
  const vb = treeMinimap.viewBox.baseVal;
  const fx = (ev.clientX - rect.left) / rect.width;
  const fy = (ev.clientY - rect.top)  / rect.height;
  const wx = vb.x + fx * vb.width;
  const wy = vb.y + fy * vb.height;
  // Center the main canvas on (wx, wy).
  const canvasRect = treeCanvasWrap.getBoundingClientRect();
  treeView.x = canvasRect.width  / 2 - wx * treeView.zoom;
  treeView.y = canvasRect.height / 2 - wy * treeView.zoom;
  treeNeedsRender = true;
}

// ───────────────────────────────────────────────────────────────
// Export full tree as PNG
// ───────────────────────────────────────────────────────────────
function treeExportPNG() {
  if (treeNodes.size === 0) return;

  // Bounding box (world coords) covering all nodes' vignette extents.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of treeNodes.values()) {
    if (n.x - TREE_VW / 2 < minX) minX = n.x - TREE_VW / 2;
    if (n.x + TREE_VW / 2 > maxX) maxX = n.x + TREE_VW / 2;
    if (n.y - TREE_VH / 2 < minY) minY = n.y - TREE_VH / 2;
    if (n.y + TREE_VH / 2 > maxY) maxY = n.y + TREE_VH / 2;
  }
  const pad = 40;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const W = Math.max(maxX - minX, 50);
  const H = Math.max(maxY - minY, 50);

  // Clone the live #treeViewport (all already-rendered edges and nodes
  // with current positions) into a fresh standalone SVG. Translating by
  // (-minX, -minY) puts the bounding box at 0,0 in the export.
  const NS = 'http://www.w3.org/2000/svg';
  const exp = document.createElementNS(NS, 'svg');
  exp.setAttribute('xmlns', NS);
  exp.setAttribute('width', W);
  exp.setAttribute('height', H);
  exp.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // Background — match canvas appearance.
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', '#0e1216');
  exp.appendChild(bg);
  // Translate the cloned viewport to the export origin.
  const wrap = document.createElementNS(NS, 'g');
  wrap.setAttribute('transform', `translate(${-minX} ${-minY})`);
  // Clone live edges and nodes, stripping any animation/highlight classes.
  const liveClone = treeViewport.cloneNode(true);
  // The clone carries the page's current pan/zoom transform — strip it.
  liveClone.removeAttribute('transform');
  // Also drop any spawning class so the export is in a steady state.
  liveClone.querySelectorAll('.spawning').forEach(el => el.classList.remove('spawning'));
  liveClone.querySelectorAll('.path-on').forEach(el => el.classList.remove('path-on'));
  wrap.appendChild(liveClone);
  exp.appendChild(wrap);

  // Inline the styles we need (cloned SVG won't inherit external CSS in
  // a fresh `<svg>`/canvas pipeline). Minimal stylesheet — just enough
  // for the tree to read on its own.
  const style = document.createElementNS(NS, 'style');
  style.textContent = `
    .tn-bg   { fill: rgba(20,26,32,0.95); stroke: #2a3038; stroke-width: 1; }
    .tn.terminal .tn-bg { stroke: #80e0a0; stroke-dasharray: 3 2; }
    .tn-depth { fill: #6a7280; font-family: monospace; font-size: 8px; }
    .tn-inner line { stroke: #ffffff; }
    .te { stroke-linecap: round; }
  `;
  exp.insertBefore(style, exp.firstChild);

  // Serialize → Blob → Image → Canvas → PNG download.
  const svgData = new XMLSerializer().serializeToString(exp);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  const img = new Image();
  img.onload = () => {
    const scale = 2;     // 2× density for sharpness
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e1216';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => {
      if (!b) return;
      triggerDownload(b, 'tromp-tree.png');
    }, 'image/png');
  };
  img.onerror = () => {
    // Fallback: download the SVG so the user still gets something usable.
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    triggerDownload(blob, 'tromp-tree.svg');
  };
  img.src = url;
}

// ───────────────────────────────────────────────────────────────
// Fork from here — make the open node the root of a fresh tree
// ───────────────────────────────────────────────────────────────
function treeFsForkFromHere() {
  if (treeFsNodeId == null) return;
  const n = treeNodes.get(treeFsNodeId);
  if (!n) return;
  const ast = n.ast;
  // Reflect the new starting expression in the input box so the user
  // sees what tree they're now exploring.
  const code = renderCodePlain(ast, false);
  const inputEl = document.getElementById('treeExpr');
  if (inputEl) inputEl.value = code;
  // Close the overlay first, then rebuild from the chosen AST.
  treeFsClose();
  treeReset(ast);
}
