// ═══════════════════════════════════════
// EXPORT — PNG, video, URL sharing
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

async function exportPNG() {
  const svg = document.getElementById('diagramSVG');
  if (!svg || !svg.getAttribute('width') || parseFloat(svg.getAttribute('width')) === 0) {
    showToast('Nothing to export — draw something first', 'warn');
    return;
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
  } catch (e) {
    showToast('Export failed: ' + e.message, 'danger');
  }
}

let isRecording = false;
let recordedFrames = [];
let recordStartTime = 0;

function toggleRecording() {
  const btn = document.getElementById('recordBtn');
  if (!isRecording) {
    if (!currentAST) { showToast('Draw something first', 'warn'); return; }
    isRecording = true;
    recordedFrames = [];
    recordStartTime = performance.now();
    btn.textContent = '■ Stop';
    btn.style.color = '#f08080';
    btn.style.borderColor = '#f08080';
    captureFrame();
    setStatus('recording... step ' + stepCount, 'running');
  } else {
    isRecording = false;
    btn.textContent = '● Rec';
    btn.style.color = '';
    btn.style.borderColor = '';
    finalizeRecording();
  }
}

async function captureFrame() {
  if (!isRecording) return;
  const svg = document.getElementById('diagramSVG');
  try {
    const canvas = await svgToCanvas(svg, 1.5);
    const now = performance.now();
    recordedFrames.push({
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      time: now - recordStartTime,
    });
  } catch (e) { console.error('Frame capture failed:', e); }
}

async function finalizeRecording() {
  if (recordedFrames.length === 0) { showToast('No frames recorded', 'warn'); return; }

  setStatus('encoding video... ' + recordedFrames.length + ' frames', 'running');

  let maxW = 0, maxH = 0;
  for (const f of recordedFrames) { maxW = Math.max(maxW, f.width); maxH = Math.max(maxH, f.height); }
  maxW = Math.ceil(maxW / 2) * 2;
  maxH = Math.ceil(maxH / 2) * 2;

  const canvas = document.createElement('canvas');
  canvas.width = maxW;
  canvas.height = maxH;
  const ctx = canvas.getContext('2d');

  const images = await Promise.all(recordedFrames.map(f =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ img, time: f.time, w: f.width, h: f.height });
      img.onerror = rej;
      img.src = f.dataUrl;
    })
  ));

  const stream = canvas.captureStream(30);
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const finished = new Promise(resolve => {
    recorder.onstop = () => {
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

  recorder.start();

  const MIN_HOLD = 50;
  for (let i = 0; i < images.length; i++) {
    const cur = images[i];
    const next = images[i + 1];
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, maxW, maxH);
    const ox = (maxW - cur.w) / 2;
    const oy = (maxH - cur.h) / 2;
    ctx.drawImage(cur.img, ox, oy, cur.w, cur.h);
    const holdMs = next ? Math.max(MIN_HOLD, next.time - cur.time) : 500;
    await new Promise(r => setTimeout(r, holdMs));
  }

  recorder.stop();
  await finished;
  setStatus('video saved (' + recordedFrames.length + ' frames)', 'nf');
  recordedFrames = [];
}

// ── URL sharing ────────────────────────────────
// Format: ?expr=<URI-encoded>  for short expressions
//         ?b64=<base64>        for longer (compact)
function shareURL() {
  const expr = (document.getElementById('expr') || document.getElementById('exprArea'))?.value || '';
  if (!expr.trim()) { showToast('Nothing to share', 'warn'); return; }
  const url = buildShareURL(expr);
  navigator.clipboard.writeText(url).then(() => {
    showToast('URL copied to clipboard', 'ok');
  }).catch(() => {
    prompt('Share URL:', url);
  });
}

function buildShareURL(expr) {
  const base = location.origin + location.pathname;
  // Use ?expr= for short; switch to ?b64= when over ~120 chars
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

// ── Copy code ────────────────────────────────
function copyCurrentCode() {
  if (!currentAST) { showToast('Nothing to copy', 'warn'); return; }
  const text = renderCodePlain(currentAST, false);
  navigator.clipboard.writeText(text).then(() => {
    showToast('Code copied', 'ok');
  }).catch(() => {
    prompt('Copy this:', text);
  });
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
