'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  tool: 'select',
  color: '#1a1a1a',
  size: 2,
  opacity: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  elements: [],
  history: [[]],
  histIdx: 0,
  drawing: false,
  startX: 0, startY: 0,
  lastX: 0, lastY: 0,
  currentPath: null,
  selectedEl: null,
  dragging: false,
  dragOffX: 0, dragOffY: 0,
  isPanning: false,
  panStartX: 0, panStartY: 0,
  panStartOffX: 0, panStartOffY: 0,
};

// ── Elements ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('text-input');

// ── Resize ─────────────────────────────────────────────────────────────────
function resize() {
  const header = 48, footer = 40;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - header - footer;
  redraw();
}
window.addEventListener('resize', resize);
resize();

// ── Coordinate helpers ─────────────────────────────────────────────────────
function toWorld(cx, cy) {
  return {
    x: (cx - state.panX) / state.zoom,
    y: (cy - state.panY) / state.zoom,
  };
}
function toScreen(wx, wy) {
  return {
    x: wx * state.zoom + state.panX,
    y: wy * state.zoom + state.panY,
  };
}

// ── History ────────────────────────────────────────────────────────────────
function saveHistory() {
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push(JSON.parse(JSON.stringify(state.elements)));
  state.histIdx = state.history.length - 1;
  if (state.history.length > 80) { state.history.shift(); state.histIdx--; }
}

function undo() {
  if (state.histIdx > 0) {
    state.histIdx--;
    state.elements = JSON.parse(JSON.stringify(state.history[state.histIdx]));
    state.selectedEl = null;
    redraw();
  }
}

function redo() {
  if (state.histIdx < state.history.length - 1) {
    state.histIdx++;
    state.elements = JSON.parse(JSON.stringify(state.history[state.histIdx]));
    state.selectedEl = null;
    redraw();
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────
function drawElement(el, selected) {
  ctx.save();
  ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = el.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (selected) {
    ctx.shadowColor = '#185fa5';
    ctx.shadowBlur = 8 / state.zoom;
  }

  switch (el.type) {
    case 'pen':
      if (!el.points || el.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length - 1; i++) {
        const mx = (el.points[i].x + el.points[i + 1].x) / 2;
        const my = (el.points[i].y + el.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, mx, my);
      }
      ctx.lineTo(el.points[el.points.length - 1].x, el.points[el.points.length - 1].y);
      ctx.stroke();
      break;

    case 'rect':
      ctx.strokeRect(el.x, el.y, el.w, el.h);
      break;

    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(el.cx, el.cy, Math.abs(el.rx), Math.abs(el.ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      break;

    case 'arrow': {
      const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(20, Math.hypot(dx, dy) * 0.3) / state.zoom;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 6), el.y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 6), el.y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      break;
    }

    case 'text':
      ctx.font = `${el.fontSize || 16}px 'DM Sans', sans-serif`;
      ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
      el.lines.forEach((line, i) => {
        ctx.fillText(line, el.x, el.y + i * (el.fontSize || 16) * 1.4);
      });
      break;
  }
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);
  for (const el of state.elements) drawElement(el, el === state.selectedEl);
  if (state.currentPath) drawElement(state.currentPath, false);
  ctx.restore();
}

// ── Hit Testing ────────────────────────────────────────────────────────────
function hitTest(el, x, y) {
  const pad = (el.size || 4) + 8;
  switch (el.type) {
    case 'pen':
      if (!el.points) return false;
      return el.points.some(p => Math.hypot(p.x - x, p.y - y) < pad);
    case 'rect':
      return x >= el.x - pad && x <= el.x + el.w + pad && y >= el.y - pad && y <= el.y + el.h + pad;
    case 'ellipse': {
      const nx = (x - el.cx) / (el.rx + pad), ny = (y - el.cy) / (el.ry + pad);
      return nx * nx + ny * ny <= 1;
    }
    case 'line':
    case 'arrow': {
      const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) return false;
      const t = Math.max(0, Math.min(1, ((x - el.x1) * dx + (y - el.y1) * dy) / (len * len)));
      return Math.hypot((el.x1 + t * dx) - x, (el.y1 + t * dy) - y) < pad;
    }
    case 'text': {
      const fs = el.fontSize || 16;
      const h = el.lines.length * fs * 1.4;
      return x >= el.x - 4 && x <= el.x + 200 && y >= el.y - fs && y <= el.y + h;
    }
  }
  return false;
}

function moveEl(el, dx, dy) {
  switch (el.type) {
    case 'pen': el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy })); break;
    case 'rect': el.x += dx; el.y += dy; break;
    case 'ellipse': el.cx += dx; el.cy += dy; break;
    case 'line': case 'arrow': el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; break;
    case 'text': el.x += dx; el.y += dy; break;
  }
}

// ── Canvas Events ──────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { cx: src.clientX - rect.left, cy: src.clientY - rect.top };
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });

canvas.addEventListener('mousemove', onMove);
canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });

canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(e); }, { passive: false });

canvas.addEventListener('mouseleave', () => {
  if (state.drawing && state.tool === 'pen' && state.currentPath) {
    state.elements.push(state.currentPath);
    state.currentPath = null;
    saveHistory();
  }
  state.drawing = false;
  state.isPanning = false;
  document.body.classList.remove('panning');
});

function onDown(e) {
  const { cx, cy } = getPos(e);
  const { x, y } = toWorld(cx, cy);

  if (state.tool === 'pan') {
    state.isPanning = true;
    state.panStartX = cx; state.panStartY = cy;
    state.panStartOffX = state.panX; state.panStartOffY = state.panY;
    document.body.classList.add('panning');
    return;
  }

  if (state.tool === 'select') {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      if (hitTest(state.elements[i], x, y)) {
        state.selectedEl = state.elements[i];
        state.dragging = true;
        state.dragOffX = x; state.dragOffY = y;
        redraw(); return;
      }
    }
    state.selectedEl = null; redraw(); return;
  }

  if (state.tool === 'eraser') {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      if (hitTest(state.elements[i], x, y)) {
        state.elements.splice(i, 1);
        saveHistory(); redraw(); return;
      }
    }
    return;
  }

  if (state.tool === 'text') {
    const { x: sx, y: sy } = toScreen(x, y);
    textInput.style.display = 'block';
    textInput.style.left = sx + 'px';
    textInput.style.top = (sy + 48) + 'px';
    textInput.style.fontSize = (16 * state.zoom) + 'px';
    textInput.style.color = state.color;
    textInput.value = '';
    textInput.dataset.wx = x;
    textInput.dataset.wy = y;
    setTimeout(() => textInput.focus(), 0);
    return;
  }

  state.drawing = true;
  state.startX = x; state.startY = y;
  state.lastX = x; state.lastY = y;

  if (state.tool === 'pen') {
    state.currentPath = {
      type: 'pen', points: [{ x, y }],
      color: state.color, size: state.size, opacity: state.opacity,
    };
  }
}

function onMove(e) {
  const { cx, cy } = getPos(e);
  const { x, y } = toWorld(cx, cy);

  if (state.isPanning) {
    state.panX = state.panStartOffX + (cx - state.panStartX);
    state.panY = state.panStartOffY + (cy - state.panStartY);
    redraw(); return;
  }

  if (state.dragging && state.selectedEl) {
    moveEl(state.selectedEl, x - state.dragOffX, y - state.dragOffY);
    state.dragOffX = x; state.dragOffY = y;
    redraw(); return;
  }

  if (!state.drawing) return;

  if (state.tool === 'pen') {
    state.currentPath.points.push({ x, y });
    redraw();
  } else {
    redraw();
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.globalAlpha = state.opacity;
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { startX: sx, startY: sy } = state;

    if (state.tool === 'rect') {
      ctx.strokeRect(sx, sy, x - sx, y - sy);
    } else if (state.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((sx + x) / 2, (sy + y) / 2, Math.abs(x - sx) / 2, Math.abs(y - sy) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.tool === 'line') {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke();
    } else if (state.tool === 'arrow') {
      const dx = x - sx, dy = y - sy;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(20, Math.hypot(dx, dy) * 0.3) / state.zoom;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - headLen * Math.cos(angle - Math.PI / 6), y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x, y);
      ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 6), y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    ctx.restore();
  }
  state.lastX = x; state.lastY = y;
}

function onUp(e) {
  const src = e.changedTouches ? e.changedTouches[0] : e;
  const rect = canvas.getBoundingClientRect();
  const cx = src.clientX - rect.left, cy = src.clientY - rect.top;
  const { x, y } = toWorld(cx, cy);

  if (state.isPanning) {
    state.isPanning = false;
    document.body.classList.remove('panning');
    return;
  }
  if (state.dragging) {
    state.dragging = false;
    saveHistory(); return;
  }
  if (!state.drawing) return;
  state.drawing = false;

  const { startX: sx, startY: sy } = state;

  if (state.tool === 'pen') {
    if (state.currentPath && state.currentPath.points.length > 1) {
      state.elements.push(state.currentPath);
      saveHistory();
    }
    state.currentPath = null;
  } else if (state.tool === 'rect') {
    state.elements.push({ type: 'rect', x: sx, y: sy, w: x - sx, h: y - sy, color: state.color, size: state.size, opacity: state.opacity });
    saveHistory();
  } else if (state.tool === 'ellipse') {
    state.elements.push({ type: 'ellipse', cx: (sx + x) / 2, cy: (sy + y) / 2, rx: Math.abs(x - sx) / 2, ry: Math.abs(y - sy) / 2, color: state.color, size: state.size, opacity: state.opacity });
    saveHistory();
  } else if (state.tool === 'line') {
    state.elements.push({ type: 'line', x1: sx, y1: sy, x2: x, y2: y, color: state.color, size: state.size, opacity: state.opacity });
    saveHistory();
  } else if (state.tool === 'arrow') {
    state.elements.push({ type: 'arrow', x1: sx, y1: sy, x2: x, y2: y, color: state.color, size: state.size, opacity: state.opacity });
    saveHistory();
  }
  redraw();
}

// ── Text Input ─────────────────────────────────────────────────────────────
function placeText() {
  const text = textInput.value.trim();
  if (text) {
    const lines = text.split('\n');
    state.elements.push({
      type: 'text', lines,
      x: +textInput.dataset.wx, y: +textInput.dataset.wy,
      color: state.color, size: state.size, opacity: state.opacity, fontSize: 16,
    });
    saveHistory(); redraw();
  }
  textInput.style.display = 'none';
}

textInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { textInput.style.display = 'none'; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); placeText(); }
});
textInput.addEventListener('blur', placeText);

// ── Zoom ───────────────────────────────────────────────────────────────────
function setZoom(newZoom, cx, cy) {
  cx = cx ?? canvas.width / 2;
  cy = cy ?? canvas.height / 2;
  newZoom = Math.min(8, Math.max(0.1, newZoom));
  state.panX = cx - (cx - state.panX) * (newZoom / state.zoom);
  state.panY = cy - (cy - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  document.getElementById('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  redraw();
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9), cx, cy);
}, { passive: false });

document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.2));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.2));
document.getElementById('zoom-fit').addEventListener('click', () => {
  state.zoom = 1; state.panX = 0; state.panY = 0;
  document.getElementById('zoom-label').textContent = '100%';
  redraw();
});

// ── Toolbar Buttons ────────────────────────────────────────────────────────
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tool = btn.dataset.tool;
    state.selectedEl = null;
    document.body.dataset.tool = state.tool;
    redraw();
  });
});

// ── Colors ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.color-swatch').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    state.color = dot.dataset.color;
    document.getElementById('custom-color').value = state.color;
    if (state.selectedEl) { state.selectedEl.color = state.color; saveHistory(); redraw(); }
  });
});

document.getElementById('custom-color').addEventListener('input', e => {
  state.color = e.target.value;
  document.querySelectorAll('.color-swatch').forEach(d => d.classList.remove('active'));
  if (state.selectedEl) { state.selectedEl.color = state.color; saveHistory(); redraw(); }
});

// ── Sizes ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.size = +btn.dataset.size;
    if (state.selectedEl) { state.selectedEl.size = state.size; saveHistory(); redraw(); }
  });
});

// ── Opacity ────────────────────────────────────────────────────────────────
const opacitySlider = document.getElementById('opacity-slider');
const opacityLabel = document.getElementById('opacity-label');
opacitySlider.addEventListener('input', () => {
  state.opacity = +opacitySlider.value / 100;
  opacityLabel.textContent = opacitySlider.value + '%';
  if (state.selectedEl) { state.selectedEl.opacity = state.opacity; saveHistory(); redraw(); }
});

// ── Undo / Redo / Clear ────────────────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear the canvas?')) {
    state.elements = []; state.selectedEl = null;
    saveHistory(); redraw();
  }
});

// ── Export ─────────────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const octx = offscreen.getContext('2d');
  octx.fillStyle = '#f8f7f4';
  octx.fillRect(0, 0, offscreen.width, offscreen.height);

  octx.save();
  octx.translate(state.panX, state.panY);
  octx.scale(state.zoom, state.zoom);
  for (const el of state.elements) {
    const origCtx = ctx;
    // re-use draw logic by swapping ctx
    octx.save();
    octx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
    octx.strokeStyle = el.color;
    octx.fillStyle = el.color;
    octx.lineWidth = el.size;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    if (el.type === 'pen' && el.points?.length > 1) {
      octx.beginPath();
      octx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length - 1; i++) {
        const mx = (el.points[i].x + el.points[i+1].x) / 2;
        const my = (el.points[i].y + el.points[i+1].y) / 2;
        octx.quadraticCurveTo(el.points[i].x, el.points[i].y, mx, my);
      }
      octx.lineTo(el.points[el.points.length-1].x, el.points[el.points.length-1].y);
      octx.stroke();
    } else if (el.type === 'rect') {
      octx.strokeRect(el.x, el.y, el.w, el.h);
    } else if (el.type === 'ellipse') {
      octx.beginPath();
      octx.ellipse(el.cx, el.cy, Math.abs(el.rx), Math.abs(el.ry), 0, 0, Math.PI*2);
      octx.stroke();
    } else if (el.type === 'line') {
      octx.beginPath(); octx.moveTo(el.x1, el.y1); octx.lineTo(el.x2, el.y2); octx.stroke();
    } else if (el.type === 'arrow') {
      const dx = el.x2-el.x1, dy = el.y2-el.y1;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(20, Math.hypot(dx,dy)*0.3) / state.zoom;
      octx.beginPath(); octx.moveTo(el.x1, el.y1); octx.lineTo(el.x2, el.y2); octx.stroke();
      octx.beginPath();
      octx.moveTo(el.x2, el.y2);
      octx.lineTo(el.x2 - headLen*Math.cos(angle-Math.PI/6), el.y2 - headLen*Math.sin(angle-Math.PI/6));
      octx.moveTo(el.x2, el.y2);
      octx.lineTo(el.x2 - headLen*Math.cos(angle+Math.PI/6), el.y2 - headLen*Math.sin(angle+Math.PI/6));
      octx.stroke();
    } else if (el.type === 'text') {
      octx.font = `${el.fontSize||16}px 'DM Sans', sans-serif`;
      el.lines.forEach((line, i) => octx.fillText(line, el.x, el.y + i * (el.fontSize||16) * 1.4));
    }
    octx.restore();
  }
  octx.restore();

  const link = document.createElement('a');
  link.download = 'ian-ryu.png';
  link.href = offscreen.toDataURL('image/png');
  link.click();
});

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────
const toolKeys = { v: 'select', h: 'pan', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow', p: 'pen', t: 'text', x: 'eraser' };

document.addEventListener('keydown', e => {
  if (e.target === textInput) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'y' || (e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedEl) {
      state.elements = state.elements.filter(el => el !== state.selectedEl);
      state.selectedEl = null;
      saveHistory(); redraw();
    }
    return;
  }
  const tool = toolKeys[e.key.toLowerCase()];
  if (tool) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`)?.classList.add('active');
    state.tool = tool;
    state.selectedEl = null;
    document.body.dataset.tool = tool;
    redraw();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
document.body.dataset.tool = 'select';
redraw();