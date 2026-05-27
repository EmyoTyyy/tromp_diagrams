# Tromp Diagrams

A static educational website for exploring lambda calculus through **Tromp diagrams**, beta-reduction visualizations, interactive puzzles, reduction trees, encodings, combinators, and reference pages.

The project is intentionally lightweight: it runs directly in the browser with plain HTML, CSS, and JavaScript. There is no build step, package manager, backend, database, or external runtime dependency.

Tromp Diagrams turns lambda-calculus expressions into visual diagrams and lets the user inspect how expressions reduce under different evaluation strategies. The site includes a multi-pane visualizer with several β-reduction strategies, custom user definitions, PNG/WebM exports, shareable URLs, a guess-the-expression game, a reduction-tree comparison view, a headless fast-reduction "God mode", a theme picker, an unlockable achievement system, and reference pages for syntax, encodings, combinators, history, and the halting problem.

---

## Quick start

Because this is a static site, the simplest way is to open `index.html` in a browser:

```bash
open index.html
```

For a more reliable development workflow — especially when testing browser features such as media export or URL behavior — serve the folder with a local static server:

```bash
python3 -m http.server 8000
```

Then open:

```txt
http://localhost:8000
```

## Pages

| Page | File | Purpose |
|---|---|---|
| Home | `index.html` | Landing page, introduction to lambda calculus and Tromp diagrams, example shapes, navigation to the main tools. |
| Visualizer | `visualizer/` | Main interactive tool. Type lambda expressions, draw diagrams, reduce expressions, compare panes, export media, and manage definitions. |
| Learn | `learn/` | Guided lambda-calculus lessons, from variables and abstraction to booleans, pairs, numerals, lists, and strategies. |
| Play | `play/` | Puzzle/game mode. The user sees a diagram and tries to guess the expression. Includes score, hints, daily puzzle logic, and local stats. |
| Tree | `tree/` | Reduction-tree visualizer. It advances multiple reduction strategies in parallel and shows where they branch or reconverge. |
| Combinators | `combinators/` | A combinator zoo with common combinators, categories, descriptions, and mini diagrams. |
| Encodings | `encodings/` | Encoding lab for naturals, booleans, pairs, Church lists, Scott lists, and related representations. |
| Halting | `halting/` | Step-by-step explanation of the halting problem in lambda calculus. |
| History | `history/` | Historical overview of lambda calculus, Church, Curry, computability, and related foundations. |
| Cheatsheet | `cheatsheet/` | Compact reference page for syntax, reduction rules, encodings, BLC, shortcuts, and common definitions. |
| Achievements | `achievements/` | Badge grid for the unlockable milestone system. Shows progress, locked hints, and gold-tier "super hard" badges. |
| About | `about/` | Project motivation, credits, stack, references, and author information. |
| Legacy / alternate page | `tromp.html` | Additional standalone Tromp page kept in the project. |

## Expression syntax

The parser accepts a compact lambda-calculus syntax.

### Lambda abstraction

```txt
\x. x
λx. x
```

Both `\` and `λ` are accepted.

Multiple binders are supported as syntax sugar:

```txt
\x y z. x z (y z)
```

This is equivalent to:

```txt
\x. \y. \z. x z (y z)
```

### Application

Application is left-associative:

```txt
f x y
```

means:

```txt
((f x) y)
```

Use parentheses to override grouping:

```txt
f (x y)
```

### Let expressions

The parser supports `let` sugar:

```txt
let id = \x. x in id a
```

Multiple bindings can be chained with semicolons:

```txt
let id = \x. x; k = \x y. x in k id a
```

### Comments

Line comments beginning with `#` are ignored by the tokenizer.

```txt
# identity function
\x. x
```

## Built-in definitions

Built-in definitions live in `js/defs.js`.

The project currently includes definitions for:

- classic combinators: `I`, `K`, `S`, `B`, `C`, `W`, `D`, `Y`, `Z`, `omega`, `id`;
- booleans: `true`, `false`, `not`, `and`, `or`, `xor`, `if`;
- pairs: `pair`, `fst`, `snd`;
- Church numerals and arithmetic: `succ`, `plus`, `mult`, `pow`, `pred`, `sub`, `iszero`, `leq`, `eq`;
- Church lists: `nil`, `cons`, `isnil`, `length`, `head`, `tail`, `map`, `append`, `sum`, `insert`, `insert_sort`;
- Scott lists: `snil`, `scons`, `sisnil`, `shead`, `stail`, `sinsert`, `sinsert_sort`.

The visualizer automatically elaborates known definition names before rendering or reducing expressions.

## Custom definitions

The Visualizer sidebar allows the user to create custom definitions.

Custom definitions are stored in `localStorage`, using the key:

```txt
tromp_diagram_user_defs
```

This means custom definitions are browser-local. They are not uploaded anywhere and they are not shared between browsers unless exported/imported manually.

### Exporting custom definitions

In `visualizer/`, use the sidebar button:

```txt
Export
```

This downloads the current custom definitions as a JSON file.

Use this before clearing browser storage or moving the project to another device.

### Importing custom definitions

In `visualizer/`, use:

```txt
Import
```

Then select a previously exported JSON file.

The project supports migration from older definition formats where a definition was stored directly as a string. Newer definitions are stored with at least an expression and a category.

### Clearing custom definitions

Use:

```txt
Clear
```

This deletes the user-defined definitions stored in the browser. Built-in definitions are not removed.

## Visualizer features

The Visualizer is the core tool of the project.

Main features:

- multiple independent panes;
- per-pane expression editor with foldable λ-bodies;
- autocomplete for known definitions;
- expression history;
- autosaved input draft (survives accidental navigation);
- beta-reduction step/run/reset controls;
- selectable reduction strategy;
- click-to-reduce redex interaction;
- color mode for variable tracking;
- animation toggle;
- explicit-parentheses toggle;
- synchronized controls across panes;
- fullscreen pane view;
- single-pane presentation mode;
- "God mode" headless fast-reduction (no diagram, no prettifier, animated loader);
- find and replace inside expressions;
- copy expression;
- shareable URLs;
- PNG export;
- WebM recording of reductions;
- Binary Lambda Calculus output;
- recognition of known encoded values;
- pinnable toolbar shortcuts (scale, speed, color, parens, sync, …);
- settings modal with reduction defaults and toolbar pinning;
- export / import of all local data as a single JSON file;
- corner stats HUD in presentation mode (steps + elapsed time).

### God mode

God mode is a headless fast-reduction path for runs that would be too slow to animate or pretty-print. While active the pane hides its diagram and prettifier, runs the reducer in fixed batches (500 steps per frame), and shows a centered animated loader. On completion the final term is parsed, drawn, and auto-fitted to the viewport — useful for terms that take tens of thousands of β-steps before normalising.

The implementation lives in `runGodMode()` inside `js/ui/pane.js`. The loader markup uses an inline SVG mask + filter (kept verbatim from `Ressources/test.html`).

### Reduction strategies

The reducer supports:

- `normal` — normal order;
- `applicative` — applicative order;
- `cbn` — call by name;
- `cbv` — call by value.

The implementation is in:

```txt
js/core/reduce.js
```

Substitution is capture-avoiding: bound variables are renamed when needed to avoid variable capture.

## Themes

The site ships with a small set of CSS-variable palettes, switchable from the nav drawer on any page.

Available themes:

- **Cyan** (default, dark) — the original palette;
- **Dracula** — classic Dracula colors;
- **Monokai** — classic Monokai colors;
- **Rose** — warm pink/peach dark theme;
- **Light** — warm-paper light theme.

Theme behavior:

- the picker lives in the nav drawer of every page and renders three-dot swatches per theme;
- hovering a swatch previews the theme live; clicking commits and persists the choice;
- the choice is stored in `localStorage` under `tromp_theme_v1` and applied as early as possible on every page to avoid a flash of the wrong palette;
- on the very first visit (no saved choice), `prefers-color-scheme: light` is honored and the Light theme is selected automatically.

Palettes are defined as `html[data-theme="<name>"]` blocks in `css/theme.css`. Adding a new theme is a matter of adding a palette block there and an entry in the `THEMES` array in `js/site.js`.

## Achievements

The site has 29 unlockable milestones — small badges that fire when the user does something interesting in the visualizer, play mode, the tree page, or while browsing reference pages.

Examples:

- first-draw, first-step, normal-form;
- using `Y` or `omega`;
- mega-reduction runs;
- back-stepping, find/replace, copy, PNG export, sharing;
- play-daily, play-extreme, daily-perfect, daily-streak-7;
- god mode, multi-pane, fullscreen, presentation;
- visiting every reference page (globetrotter);
- seeing every theme (all-themes);
- using every classic combinator (combinator-master);
- the Konami code easter egg;
- typing `S K I B I D I` as an expression (skibidi);
- gold-tier "super hard" badges with a shimmer effect;
- `Completionist` (`all-clear`) — always sorted last and unlocks when every other badge is earned.

Achievement state lives in `localStorage` under `tromp_achievements_v1` (plus `tromp_combs_used_v1` and `tromp_seen_themes_v1` for the multi-event ones). Unlock popups are clickable and navigate to `/achievements/`, the badge grid page. Locked badges hide their icon and hint behind a `?` placeholder until earned.

The catalogue and unlock helper live in `js/achievements.js`.

## Tree mode

`tree/` visualizes how reduction strategies evolve from the same starting expression.

The page runs the available strategies in parallel. When strategies produce different expressions, the tree branches. When two states are alpha-equivalent, branches can merge back together.

Tree mode includes:

- strategy paths for normal, applicative, call-by-name, and call-by-value;
- branching/reconvergence based on expression states;
- alpha-equivalence comparison;
- draggable nodes;
- zoom and pan;
- minimap;
- fullscreen inspection of a single node;
- fork-from-here action;
- export to PNG/SVG;
- direct link from a node to the Visualizer.

The tree physics is implemented in:

```txt
js/modes/tree.js
```

The current physics model uses positions, velocities, spring-like edges, damping, repulsion, and layout stabilization. The goal is visual clarity and interaction, not a physically exact simulation.

## Play mode

`play/` is a puzzle mode.

The page renders a Tromp diagram and asks the user to guess the lambda expression. Puzzles are ordered by approximate difficulty and include fundamentals, booleans, arithmetic, lists, self-application, and fixed-point combinators.

Play mode includes:

- score tracking;
- attempts;
- hints;
- skip/reveal behavior;
- local best score;
- local long-running stats;
- daily puzzle generated procedurally from the date;
- random-puzzle button (genuinely fresh each click);
- free color-coding mode (no scoring penalty);
- daily streak tracking.

Play mode persists per-mode bests, daily state, and long-running stats in `localStorage` — see the [Browser storage](#browser-storage) table for the exact keys.

## Encodings and recognition

The project includes support for several representations and recognition helpers.

Implemented in `js/core/encoding.js`:

- Binary Lambda Calculus encoding;
- BLC decoding;
- De Bruijn representation;
- alpha-equivalence;
- Church numeral recognition;
- Church list recognition;
- Scott list recognition.

The Visualizer can show BLC output and recognized encoded values from the active expression.

## Shareable URLs

The visualizer can generate links containing the current expression.

Short expressions are encoded as:

```txt
?expr=<encoded expression>
```

Longer expressions are encoded as:

```txt
?b64=<base64 expression>
```

This is handled in:

```txt
js/ui/export.js
```

The Visualizer and Tree pages both know how to read these URL parameters.

## Exporting diagrams and reductions

### PNG export

The Visualizer can export diagrams as PNG files. The export pipeline serializes the SVG, draws it onto a canvas, then downloads the canvas as an image.

Tree mode also includes PNG export for the reduction tree and for fullscreen nodes.

### WebM recording

The Visualizer can record reduction steps as a WebM video. It captures SVG frames into canvases and uses the browser `MediaRecorder` API.

This depends on browser support. If recording fails, test in a modern Chromium-based browser first.

## Keyboard shortcuts

Both the Visualizer and Tree pages include a shortcuts modal opened with:

```txt
?
```

It lists every shortcut for the current page and can also be opened from the toolbar.

Important Visualizer shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Draw the current expression |
| `Tab` | Accept autocomplete suggestion |
| `Ctrl + F` | Open find/replace in the active pane |
| `Esc` | Close autocomplete, find bar, fullscreen, or presentation mode |
| Mouse wheel | Zoom diagram |
| Click + drag | Pan diagram |

Presentation mode shortcuts:

| Shortcut | Action |
|---|---|
| `Space` / `→` | Step forward |
| `←` | Step back |
| `R` | Run |
| `P` | Pause/resume |
| `0` | Reset |
| `F` | Fit to viewport |
| `H` | Hide HUD/code overlay |

Tree mode shortcuts:

| Shortcut | Action |
|---|---|
| `Space` / `→` | Step the tree |
| `R` | Run/pause tree mode |
| `S` | Reset (re-parse the expression and replay from scratch) |
| `F` | Fit tree to view |
| `M` | Toggle minimap |
| `?` | Open shortcuts list |
| `Esc` | Close fullscreen node or clear highlight |

Play mode shortcuts use `Alt` so they do not interfere with typing:

| Shortcut | Action |
|---|---|
| `Alt + H` | Show hint |
| `Alt + S` | Skip puzzle |
| `Alt + R` | Reveal/give up |

---

## Project structure

```txt
Site tromp/
├── index.html
├── 404.html
├── tromp.html              # legacy monolith, not linked
├── visualizer/index.html   # each page is /<name>/index.html so URLs
├── learn/index.html        # are clean (e.g. /play/ instead of /play.html)
├── play/index.html
├── tree/index.html
├── combinators/index.html
├── encodings/index.html
├── halting/index.html
├── history/index.html
├── cheatsheet/index.html
├── achievements/index.html
├── about/index.html
├── sitemap.xml
├── robots.txt
├── TODO.txt
├── README.md
├── css/
│   ├── theme.css
│   ├── pages.css
│   └── visualizer.css
└── js/
    ├── app.js
    ├── site.js               # nav drawer, theme picker, cross-page toasts
    ├── achievements.js       # 29-badge catalogue + unlock helper + persistence
    ├── defs.js
    ├── core/
    │   ├── ast.js
    │   ├── parser.js
    │   ├── elaborate.js
    │   ├── reduce.js
    │   └── encoding.js
    ├── modes/
    │   ├── play.js
    │   └── tree.js
    └── ui/
        ├── autocomplete.js
        ├── editor.js
        ├── export.js
        ├── layout.js
        ├── pane.js
        ├── presentation.js
        ├── render.js
        └── sidebar.js
```

## Development notes

The codebase is split into three rough layers.

### Core lambda-calculus logic

```txt
js/core/ast.js
js/core/parser.js
js/core/elaborate.js
js/core/reduce.js
js/core/encoding.js
```

This layer should stay independent from the UI when possible.

### UI and visualizer infrastructure

```txt
js/ui/editor.js
js/ui/pane.js
js/ui/render.js
js/ui/layout.js
js/ui/sidebar.js
js/ui/autocomplete.js
js/ui/export.js
js/ui/presentation.js
```

This layer owns the editor, panes, SVG rendering, export tools, sidebar, and presentation behavior.

### Page-specific modes

```txt
js/modes/play.js
js/modes/tree.js
```

These files implement the game and reduction-tree pages.

## Common places to edit

| Task | File |
|---|---|
| Add a built-in definition | `js/defs.js` |
| Change parsing syntax | `js/core/parser.js` |
| Change beta-reduction behavior | `js/core/reduce.js` |
| Change diagram drawing | `js/ui/render.js` and `js/ui/layout.js` |
| Change pane controls | `js/ui/pane.js` |
| Change Visualizer orchestration | `js/app.js` |
| Change custom definition import/export | `js/defs.js` and related sidebar/export code |
| Change Play puzzles | `js/modes/play.js` |
| Change Tree physics/layout | `js/modes/tree.js` |
| Add / tweak an achievement | `js/achievements.js` |
| Add a theme | `css/theme.css` (palette block) + `js/site.js` (`THEMES` array) |
| Change nav drawer / theme picker / cross-page toasts | `js/site.js` |
| Change global colors/theme | `css/theme.css` |
| Change page-specific article layouts | `css/pages.css` |
| Change Visualizer layout | `css/visualizer.css` |

## Browser storage

The project uses `localStorage` for user-facing persistence. All keys are namespaced with the `tromp_` prefix so an export covers them cleanly.

| Key | Purpose |
|---|---|
| `tromp_visualizer_settings_v1` | Visualizer settings (reduction defaults, pinned toolbar items, …) |
| `tromp_theme_v1` | Selected color theme |
| `tromp_achievements_v1` | Unlocked achievement IDs |
| `tromp_combs_used_v1` | Combinators used so far (powers `combinator-master`) |
| `tromp_seen_themes_v1` | Themes seen so far (powers `all-themes`) |
| `tromp_diagram_user_defs` | Custom user definitions |
| `tromp_diagram_expr_history` | Expression history |
| `tromp_draft_v1` | Autosaved current input draft |
| `tromp_iota_unlocked` | Iota easter-egg state |
| `tromp_play_bests_v2` | Play mode per-mode best scores |
| `tromp_play_daily` | Daily puzzle state and streak |
| `tromp_play_stats` | Long-running play stats |

The Visualizer settings modal includes **Export all data** and **Import all data** buttons that round-trip every key above as a single JSON blob (`tromp-data-YYYY-MM-DD.json`).

Clearing browser data may remove these values. Use the data export before clearing storage, or before moving the project to another device.

## Limitations

This is an educational and visual project, not a production theorem prover or a fully optimized lambda-calculus engine.

Known limitations:

- very large expressions can become slow to render or reduce;
- divergent expressions can run forever unless stopped or capped;
- WebM recording depends on browser support;
- localStorage data is local to one browser profile;
- the tree physics prioritizes readability and interaction over exact physical correctness;
- some advanced lambda-calculus concepts may be simplified for teaching purposes.

## Credits

Built by **EmyoT** with substantial help from Claude.

Main references and inspirations include:

- John Tromp's original work on Binary Lambda Calculus and Tromp diagrams;
- lambda calculus;
- Church encoding;
- De Bruijn indices;
- fixed-point combinators;
- classic computability theory and the halting problem.

See `about/` for the user-facing credits page.
