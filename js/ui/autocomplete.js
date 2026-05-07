// ═══════════════════════════════════════
// AUTOCOMPLETE HELPERS — Levenshtein + globals
//
// The actual per-pane autocomplete logic lives in app.js (paneUpdateAutocomplete,
// paneRenderAutocomplete, paneAcceptAutocomplete). This module only exports the
// shared Levenshtein helper and the global ac state used by the pane logic.
// ═══════════════════════════════════════

let acSelected = -1;
let acOptions = [];

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[a.length][b.length];
}
