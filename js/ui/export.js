// ═══════════════════════════════════════
// EXPORT — shared helpers used by pane.js + app.js
//
// The single-pane legacy versions of exportPNG / toggleRecording /
// shareURL / copyCurrentCode used to live here too. They depended on
// global `currentAST`, `stepCount`, and `#diagramSVG` — none of which
// exist in the per-pane setup. They were unreachable dead code, so
// they've been removed. The live equivalents are methods on Pane:
//   pane.exportPNG(), pane.toggleRecording(), pane.share(), pane.copyCode()
// ═══════════════════════════════════════

function svgToCanvas(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const w = parseFloat(svgEl.getAttribute('width'));
    const h = parseFloat(svgEl.getAttribute('height'));
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// ── URL sharing ────────────────────────────────
// Format: ?expr=<URI-encoded>  for short expressions
//         ?b64=<base64>        for longer (compact)
function buildShareURL(expr) {
  const base = location.origin + location.pathname;
  if (expr.length < 120) {
    return base + '?expr=' + encodeURIComponent(expr);
  }
  // base64 the UTF-8 bytes
  try {
    const b64 = btoa(unescape(encodeURIComponent(expr)));
    return base + '?b64=' + encodeURIComponent(b64);
  } catch {
    return base + '?expr=' + encodeURIComponent(expr);
  }
}

function readURLExpression() {
  const params = new URLSearchParams(location.search);
  if (params.has('expr')) return params.get('expr');
  if (params.has('b64')) {
    try { return decodeURIComponent(escape(atob(params.get('b64')))); }
    catch { return null; }
  }
  return null;
}

// ── Toast helper ────────────────────────────────
let toastTimer = null;
function showToast(msg, kind = '') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = 'toast' + (kind ? ' ' + kind : '');
  toast.textContent = msg;
  // Force reflow for transition
  toast.offsetHeight;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2400);
}
