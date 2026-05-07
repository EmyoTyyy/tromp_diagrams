// ═══════════════════════════════════════
// ZOOM/PAN, FULLSCREEN, PRESENTATION MODE
// ═══════════════════════════════════════

let viewZoom = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;
let inPresentation = false;
let hudHidden = false;

function applyViewport() {
  const vp = document.getElementById('viewport');
  if (!vp) return;
  vp.setAttribute('transform', `translate(${viewOffsetX}, ${viewOffsetY}) scale(${viewZoom})`);
  const lvl = document.getElementById('zoomLevel');
  if (lvl) lvl.textContent = Math.round(viewZoom * 100) + '%';
}

function zoomBy(factor, centerX, centerY) {
  const dw = document.getElementById('out');
  if (!dw) return;
  const rect = dw.getBoundingClientRect();
  if (centerX === undefined) centerX = rect.width / 2;
  if (centerY === undefined) centerY = rect.height / 2;
  const newZoom = Math.min(20, Math.max(0.05, viewZoom * factor));
  const k = newZoom / viewZoom;
  viewOffsetX = centerX - (centerX - viewOffsetX) * k;
  viewOffsetY = centerY - (centerY - viewOffsetY) * k;
  viewZoom = newZoom;
  applyViewport();
}

function resetView() {
  viewZoom = 1;
  viewOffsetX = 0;
  viewOffsetY = 0;
  applyViewport();
}

// Fit current diagram to ~90% of container.
// In fullscreen: top-left, just scaled to fit.
// In presentation: centered.
// In normal mode: also top-left fit.
function autoFit() {
  const dw = document.getElementById('out');
  const svg = document.getElementById('diagramSVG');
  if (!dw || !svg) return;
  const containerW = dw.clientWidth;
  const containerH = dw.clientHeight;
  if (containerW < 50 || containerH < 50) {
    requestAnimationFrame(autoFit);
    return;
  }
  const svgW = parseFloat(svg.getAttribute('width')) || 1;
  const svgH = parseFloat(svg.getAttribute('height')) || 1;
  if (svgW < 2 || svgH < 2) {
    requestAnimationFrame(autoFit);
    return;
  }
  const padding = 40;
  const scaleX = (containerW - padding) / svgW;
  const scaleY = (containerH - padding) / svgH;
  const target = Math.min(scaleX, scaleY) * 0.95;
  viewZoom = Math.max(0.05, Math.min(target, 10));

  if (inPresentation) {
    // Center the (zoomed) SVG within the container.
    viewOffsetX = (containerW - svgW * viewZoom) / 2;
    viewOffsetY = (containerH - svgH * viewZoom) / 2;
  } else if (dw.classList.contains('fullscreen')) {
    // Fullscreen: top-left, no centering. SVG is positioned at (24, 60) absolutely.
    viewOffsetX = 0;
    viewOffsetY = 0;
  } else {
    // Normal mode: flex-centered SVG, transform centers it.
    viewOffsetX = svgW / 2 * (1 - viewZoom);
    viewOffsetY = svgH / 2 * (1 - viewZoom);
  }
  applyViewport();
}

function toggleFullscreen() {
  const dw = document.getElementById('out');
  if (!dw) return;
  const wasFs = dw.classList.contains('fullscreen');
  dw.classList.toggle('fullscreen');
  if (!wasFs) {
    setTimeout(() => autoFit(), 50);
  } else {
    resetView();
  }
}

function setupZoomPan() {
  const dw = document.getElementById('out');
  if (!dw) return;

  dw.addEventListener('wheel', (e) => {
    if (e.target.closest('.zoom-controls') || e.target.closest('.fs-btn')) return;
    e.preventDefault();
    const rect = dw.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
    zoomBy(factor, cx, cy);
  }, { passive: false });

  let panning = false;
  let panStartX = 0, panStartY = 0;
  let panOrigX = 0, panOrigY = 0;

  dw.addEventListener('mousedown', (e) => {
    if (e.target.closest('.redex-zone')) return;
    if (e.target.closest('button')) return;
    if (e.button !== 0 && e.button !== 1) return;
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOrigX = viewOffsetX;
    panOrigY = viewOffsetY;
    dw.classList.add('panning');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    viewOffsetX = panOrigX + (e.clientX - panStartX);
    viewOffsetY = panOrigY + (e.clientY - panStartY);
    applyViewport();
  });

  window.addEventListener('mouseup', () => {
    if (panning) { panning = false; dw.classList.remove('panning'); }
  });
}

function enterPresentation() {
  if (!currentAST) { showToast('Draw something first', 'warn'); return; }
  inPresentation = true;
  hudHidden = false;
  document.body.classList.add('presentation');
  document.body.classList.remove('hud-hidden');
  setTimeout(() => autoFit(), 80);
  setTimeout(() => updatePresStatus(), 100);
}

function exitPresentation() {
  if (!inPresentation) return;
  inPresentation = false;
  document.body.classList.remove('presentation', 'hud-hidden');
  resetView();
}

function toggleHudHidden() {
  hudHidden = !hudHidden;
  document.body.classList.toggle('hud-hidden', hudHidden);
}

function updatePresStatus() {
  const el = document.getElementById('presStatus');
  if (!el) return;
  el.textContent = document.getElementById('status')?.textContent || '';
}
