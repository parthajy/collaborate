// Client entry point. Boots the room: theme, toolbar, options panel, modals,
// zoom, snapshot, the welcome gate, the live timer, and keyboard shortcuts —
// then wires the Yjs sync engine into the canvas, objects, and presence.

import {
  roomName,
  doc,
  yStrokes,
  yShapes,
  yObjects,
  yEdges,
  yLog,
  undoManager,
  transact,
  itemCount,
  clientUid,
  onConnectionRefused,
  onSynced,
} from './sync';
import {
  canvasEl,
  render,
  requestRender,
  resize,
  s2w,
  view,
  zoomAt,
  resetView,
  onViewChange,
  onPostRender,
} from './canvas';
import { initObjects, addImage, addVideo, addLink, setObjectsInteractive, liveObjectsForSnapshot } from './objects';
import { initDraw } from './draw';
import { setUser, getExpiresAt } from './presence';
import { state, toolCursor, type Tool } from './state';
import { toast } from './toast';
import { deselect, deleteSelected } from './selection';
import { PALETTE, buildSwatches, buildCustomSwatch } from './colors';
import { seedTemplate, TEMPLATE_NAMES } from './templates';
import { logEvent } from './log';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

// --- theme --------------------------------------------------------------------

const root = document.documentElement;
const themeToggle = $('themeToggle');

function applyThemeIcon(): void {
  const dark = root.getAttribute('data-theme') === 'dark';
  (themeToggle.querySelector('.sun') as HTMLElement).style.display = dark ? 'block' : 'none';
  (themeToggle.querySelector('.moon') as HTMLElement).style.display = dark ? 'none' : 'block';
}
try {
  const saved = localStorage.getItem('cs.theme');
  if (saved) root.setAttribute('data-theme', saved);
} catch {
  /* storage blocked — fine, default theme stands */
}
applyThemeIcon();
themeToggle.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem('cs.theme', next);
  } catch {
    /* ignore */
  }
  applyThemeIcon();
  render();
});

// --- room labels --------------------------------------------------------------

$('roomLabel').textContent = roomName;
document.title = `collaborate.so/${roomName}`;

// --- toolbar ------------------------------------------------------------------

const optionsPanel = $('optionsPanel');
const OPTION_TOOLS = new Set(['pen', 'marker', 'eraser', 'rect', 'ellipse', 'line', 'arrow']);

function setTool(t: Tool): void {
  state.tool = t;
  document.querySelectorAll<HTMLElement>('.icb[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  canvasEl.style.cursor = toolCursor();
  optionsPanel.classList.toggle('show', OPTION_TOOLS.has(t));
  fillSection.style.display = t === 'rect' || t === 'ellipse' ? '' : 'none';
  setObjectsInteractive(t === 'select' || t === 'hand');
  if (t !== 'select') {
    deselect();
    fadeEmptyHints();
  }
}
document.querySelectorAll<HTMLElement>('.icb[data-tool]').forEach((b) => {
  b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
});

// --- colors + fill ------------------------------------------------------------

const colorGrid = $('colorGrid');
const colorName = $('colorName');
const PALETTE_HEXES = PALETTE.map((p) => p.hex);

function colorNameFor(hex: string): string {
  return PALETTE.find((p) => p.hex.toLowerCase() === hex.toLowerCase())?.name ?? 'custom';
}

// Stroke / brush color — expanded palette plus a custom picker.
const setStrokeSwatch = buildSwatches(colorGrid, PALETTE_HEXES, (hex) => {
  state.color = hex;
  setStrokeSwatch(hex);
  colorName.textContent = colorNameFor(hex);
});
colorGrid.appendChild(
  buildCustomSwatch((hex) => {
    state.color = hex;
    setStrokeSwatch(hex);
    colorName.textContent = 'custom';
  }),
);
setStrokeSwatch(state.color);
colorName.textContent = colorNameFor(state.color);

// Fill controls — shown only for the rectangle / ellipse tools.
const fillSection = document.createElement('div');
const fillLabel = document.createElement('div');
fillLabel.className = 'opt-label';
fillLabel.textContent = 'FILL';
const fillGrid = document.createElement('div');
fillGrid.className = 'color-grid';

const fillNone = document.createElement('div');
fillNone.className = 'color-swatch active';
fillNone.title = 'no fill';
fillNone.textContent = '/';
fillNone.style.cssText =
  'display:flex;align-items:center;justify-content:center;' +
  'font-size:12px;color:var(--text-dim);background:transparent;';

const setFillSwatch = buildSwatches(fillGrid, PALETTE_HEXES, (hex) => {
  state.fill = hex;
  setFillSwatch(hex);
  fillNone.classList.remove('active');
});
fillGrid.insertBefore(fillNone, fillGrid.firstChild);
fillGrid.appendChild(
  buildCustomSwatch((hex) => {
    state.fill = hex;
    setFillSwatch(hex);
    fillNone.classList.remove('active');
  }),
);
fillNone.addEventListener('click', () => {
  state.fill = null;
  setFillSwatch('');
  fillNone.classList.add('active');
});
fillSection.append(fillLabel, fillGrid);
fillSection.style.display = 'none';
optionsPanel.insertBefore(fillSection, optionsPanel.querySelectorAll('.opt-label')[1] ?? null);

// --- size ---------------------------------------------------------------------

const sizeSlider = $<HTMLInputElement>('sizeSlider');
const sizePreview = $('sizePreview');
const sizeVal = $('sizeVal');
function paintSize(): void {
  const px = Math.min(state.size, 28);
  sizePreview.style.width = px + 'px';
  sizePreview.style.height = px + 'px';
  sizeVal.innerHTML = `${state.size}<span style="color:var(--text-dimmer)">px</span>`;
}
sizeSlider.addEventListener('input', () => {
  state.size = parseInt(sizeSlider.value, 10);
  paintSize();
});
paintSize();

// --- modals -------------------------------------------------------------------

function openModal(id: string): void {
  $(id).classList.add('show');
  setTimeout(() => $(id).querySelector('input')?.focus(), 50);
}
function closeModal(id: string): void {
  $(id).classList.remove('show');
}
const openImageModal = (): void => openModal('imageModal');
const openVideoModal = (): void => openModal('videoModal');
const openLinkModal = (): void => openModal('linkModal');

function viewportCenter(): { x: number; y: number } {
  return s2w({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
}

function addImageFromUrl(): void {
  const input = $<HTMLInputElement>('imageUrl');
  const url = input.value.trim();
  if (!url) return;
  const c = viewportCenter();
  addImage(c.x, c.y, url);
  input.value = '';
  closeModal('imageModal');
}
function addVideoFromUrl(): void {
  const input = $<HTMLInputElement>('videoUrl');
  const url = input.value.trim();
  if (!url) return;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  const vm = url.match(/vimeo\.com\/(\d+)/);
  let embed = '';
  if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  else if (vm) embed = `https://player.vimeo.com/video/${vm[1]}`;
  else {
    toast('youtube or vimeo URL needed');
    return;
  }
  const c = viewportCenter();
  addVideo(c.x - 240, c.y - 135, embed);
  input.value = '';
  closeModal('videoModal');
}
function addLinkFromUrl(): void {
  const input = $<HTMLInputElement>('linkUrl');
  let url = input.value.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  const c = viewportCenter();
  addLink(c.x - 160, c.y - 30, url);
  input.value = '';
  closeModal('linkModal');
}

document.querySelectorAll<HTMLElement>('.modal-overlay').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('show');
  });
  m.querySelector('input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter') return;
    if (m.id === 'imageModal') addImageFromUrl();
    if (m.id === 'videoModal') addVideoFromUrl();
    if (m.id === 'linkModal') addLinkFromUrl();
    if (m.id === 'nameModal') enterRoom();
  });
});

// --- actions: undo, clear, zoom, copy, snapshot -------------------------------

function undo(): void {
  undoManager.undo();
}
function clearAll(): void {
  if (!confirm('Clear everything you have added to this room?')) return;
  // Only the caller's own artifacts (and unowned/template items) are removed —
  // consistent with creator-only delete.
  const mine = (by: string | undefined): boolean => !by || by === clientUid;
  transact(() => {
    for (let i = yStrokes.length - 1; i >= 0; i--) {
      if (mine(yStrokes.get(i).by)) yStrokes.delete(i, 1);
    }
    for (const k of [...yShapes.keys()]) {
      if (mine(yShapes.get(k)?.by)) yShapes.delete(k);
    }
    for (const k of [...yObjects.keys()]) {
      if (mine(yObjects.get(k)?.get('by') as string | undefined)) yObjects.delete(k);
    }
    for (const k of [...yEdges.keys()]) {
      if (mine(yEdges.get(k)?.by)) yEdges.delete(k);
    }
  });
  logEvent('cleared their items');
}

const zoomVal = $('zoomVal');
onViewChange(() => {
  zoomVal.textContent = Math.round(view.zoom * 100) + '%';
});
const zoomIn = (): void =>
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
const zoomOut = (): void =>
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8);

function copyLink(): void {
  navigator.clipboard
    .writeText(location.href)
    .then(() => toast('link copied'))
    .catch(() => toast(location.href));
}

// The logo image, preloaded so the snapshot footer can draw it synchronously.
const snapshotLogo = new Image();
snapshotLogo.src = '/coll.png';

function saveSnapshot(): void {
  const dpr = window.devicePixelRatio || 1;
  const footer = 54; // CSS px — branded strip along the bottom
  const out = document.createElement('canvas');
  out.width = window.innerWidth * dpr;
  out.height = (window.innerHeight + footer) * dpr;
  const octx = out.getContext('2d') as CanvasRenderingContext2D;

  const cssVar = (name: string, fallback: string): string =>
    getComputedStyle(root).getPropertyValue(name).trim() || fallback;

  octx.fillStyle = cssVar('--bg', '#f7efe4');
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvasEl, 0, 0);

  const accent = cssVar('--accent', '#f95d50');
  for (const o of liveObjectsForSnapshot()) {
    const r = o.el.getBoundingClientRect();
    if (o.type === 'sticky') {
      octx.save();
      octx.translate((r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr);
      octx.rotate((o.rotation * Math.PI) / 180);
      octx.fillStyle = o.bg || '#ffd84d';
      octx.fillRect((-r.width / 2) * dpr, (-r.height / 2) * dpr, r.width * dpr, r.height * dpr);
      octx.fillStyle = '#1a1a1a';
      octx.font = `${22 * view.zoom * dpr}px Caveat, cursive`;
      o.text.split('\n').forEach((line, i) => {
        octx.fillText(
          line,
          (-r.width / 2) * dpr + 18 * dpr,
          (-r.height / 2) * dpr + (40 + i * 28) * dpr,
        );
      });
      octx.restore();
    } else {
      octx.strokeStyle = accent;
      octx.lineWidth = 1;
      octx.strokeRect(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
      octx.fillStyle = '#888';
      octx.font = `${11 * dpr}px 'Geist Mono', monospace`;
      octx.fillText(o.type.toUpperCase(), r.left * dpr + 6 * dpr, r.top * dpr + 16 * dpr);
    }
  }

  // --- branded footer: the logo + collaborate.so/<room> ---
  const fy = window.innerHeight * dpr;
  const fh = footer * dpr;
  octx.fillStyle = cssVar('--bg-soft', '#fffaf1');
  octx.fillRect(0, fy, out.width, fh);
  octx.fillStyle = cssVar('--line', '#e3d7c5');
  octx.fillRect(0, fy, out.width, dpr);

  let textX = 24 * dpr;
  if (snapshotLogo.complete && snapshotLogo.naturalWidth > 0) {
    const lh = 24 * dpr;
    const lw = lh * (snapshotLogo.naturalWidth / snapshotLogo.naturalHeight);
    octx.drawImage(snapshotLogo, 24 * dpr, fy + (fh - lh) / 2, lw, lh);
    textX = 24 * dpr + lw + 13 * dpr;
  }
  octx.textBaseline = 'middle';
  octx.textAlign = 'left';
  octx.font = `600 ${14 * dpr}px 'Geist Mono', monospace`;
  octx.fillStyle = cssVar('--text', '#32243d');
  octx.fillText(`collaborate.so/${roomName}`, textX, fy + fh / 2 + dpr);
  octx.textAlign = 'right';
  octx.font = `${12 * dpr}px 'Geist Mono', monospace`;
  octx.fillStyle = cssVar('--text-dim', '#6f6377');
  octx.fillText(new Date().toLocaleDateString(), out.width - 24 * dpr, fy + fh / 2 + dpr);

  const link = document.createElement('a');
  link.download = `collaborate-${roomName}-${Date.now()}.png`;
  link.href = out.toDataURL('image/png');
  link.click();
  toast('snapshot saved');
}

// --- activity log modal -------------------------------------------------------

const logList = $('logList');

function relativeTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderLog(): void {
  const entries = yLog.toArray();
  if (entries.length === 0) {
    logList.innerHTML =
      '<div style="color:var(--text-dim);font-size:13px;padding:8px 2px;">' +
      'Nothing yet — activity shows up here as people work.</div>';
    return;
  }
  logList.innerHTML = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;gap:10px;padding:7px 2px;border-bottom:1px solid var(--line-soft);';
    const time = document.createElement('span');
    time.textContent = relativeTime(e.t);
    time.style.cssText =
      "font-family:'Geist Mono',monospace;font-size:10px;color:var(--text-dimmer);" +
      'white-space:nowrap;min-width:54px;padding-top:2px;';
    const body = document.createElement('span');
    body.style.cssText = 'color:var(--text-dim);font-size:13px;line-height:1.4;';
    const who = document.createElement('strong');
    who.textContent = e.name + ' ';
    who.style.color = 'var(--text)';
    body.append(who, document.createTextNode(e.text));
    row.append(time, body);
    logList.appendChild(row);
  }
}

$('logBtn').addEventListener('click', () => {
  renderLog();
  $('logModal').classList.add('show');
});
// Keep the log live while the modal is open.
yLog.observe(() => {
  if ($('logModal').classList.contains('show')) renderLog();
});

// --- empty hints --------------------------------------------------------------

const emptyHints = $('emptyHints');
let emptyFaded = false;
function showEmptyHints(): void {
  setTimeout(() => {
    if (!emptyFaded) emptyHints.classList.add('show');
  }, 600);
}
function fadeEmptyHints(): void {
  if (emptyFaded) return;
  emptyFaded = true;
  emptyHints.classList.add('fade-out');
  setTimeout(() => (emptyHints.style.display = 'none'), 600);
}

// --- live timer ---------------------------------------------------------------

const timerEl = $('timer');
function tickTimer(): void {
  const exp = getExpiresAt();
  if (!exp) {
    timerEl.textContent = '—';
    return;
  }
  const ms = exp - Date.now();
  if (ms <= 0) {
    timerEl.textContent = 'expired';
    return;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  timerEl.textContent = `${h}h ${String(m).padStart(2, '0')}m`;
}
setInterval(tickTimer, 1000);
tickTimer();

// --- name popup (optional, non-blocking) -------------------------------------
// The canvas is live the moment the page loads; this popup only asks for a
// display name and is dismissed with Skip, Start, Enter, or a backdrop click.

const nameModal = $('nameModal');
const nameInput = $<HTMLInputElement>('nameInput');
const templatePicker = $('templatePicker');
let chosenTemplate = 'Blank';

function randomAnon(): string {
  return 'guest-' + Math.random().toString(36).slice(2, 6);
}

let savedName = '';
try {
  savedName = localStorage.getItem('cs.name') ?? '';
} catch {
  /* storage blocked — start with an empty field */
}
if (savedName) nameInput.value = savedName;

// Join presence immediately so cursors work before (or without) naming.
setUser(savedName || randomAnon());

// Template picker — built now, revealed once we know the room is empty.
(function buildTemplatePicker(): void {
  const lbl = document.createElement('div');
  lbl.className = 'opt-label';
  lbl.style.cssText = 'margin:4px 2px 8px;';
  lbl.textContent = 'START FROM A TEMPLATE';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;';
  const chips: HTMLButtonElement[] = [];
  for (const name of TEMPLATE_NAMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = name;
    chip.style.cssText =
      'flex:1;min-width:72px;height:32px;border-radius:7px;cursor:pointer;' +
      "font-family:'Geist',sans-serif;font-size:12px;border:1px solid var(--line);" +
      'background:var(--bg);color:var(--text-dim);' +
      'transition:background .15s,color .15s,border-color .15s;';
    chip.addEventListener('click', () => {
      chosenTemplate = name;
      for (const c of chips) {
        const on = c === chip;
        c.style.background = on ? 'var(--accent)' : 'var(--bg)';
        c.style.color = on ? 'var(--accent-ink)' : 'var(--text-dim)';
        c.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
      }
    });
    chips.push(chip);
    grid.appendChild(chip);
  }
  templatePicker.append(lbl, grid);
  chips[0]?.click(); // default selection: Blank
})();

// Reveal the picker only for a genuinely empty room — never clobber real work.
onSynced(() => {
  if (itemCount() === 0) templatePicker.style.display = '';
});

function applyChosenTemplate(): void {
  if (chosenTemplate !== 'Blank' && itemCount() === 0) seedTemplate(chosenTemplate);
}

function enterRoom(): void {
  const name = nameInput.value.trim();
  if (name) {
    try {
      localStorage.setItem('cs.name', name);
    } catch {
      /* ignore */
    }
    setUser(name);
  }
  applyChosenTemplate();
  nameModal.classList.remove('show');
}
function skipName(): void {
  applyChosenTemplate();
  nameModal.classList.remove('show');
}

onConnectionRefused((reason) => toast(reason));
setTimeout(() => nameInput.focus(), 120);

// --- keyboard -----------------------------------------------------------------

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  p: 'pen',
  e: 'eraser',
  t: 'text',
  s: 'sticky',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  f: 'flowcard',
};

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input, textarea, [contenteditable]')) return;

  if (e.code === 'Space') {
    state.spaceDown = true;
    canvasEl.style.cursor = 'grab';
    e.preventDefault();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) undoManager.redo();
    else undoManager.undo();
    return;
  }
  if (e.metaKey || e.ctrlKey) return;
  if (e.key === 'Escape') {
    ['imageModal', 'videoModal', 'linkModal'].forEach(closeModal);
    deselect();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (e.key === 'i' || e.key === 'I') {
    openImageModal();
    return;
  }
  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (tool) setTool(tool);
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    state.spaceDown = false;
    canvasEl.style.cursor = toolCursor();
  }
});

document.addEventListener('paste', (e) => {
  // Ignore pastes into a field/modal (e.g. the image-URL input) - the field
  // handles those itself; reacting here too would add the image twice.
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable], .modal-overlay')) return;
  const text = e.clipboardData?.getData('text') ?? '';
  if (/^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)/i.test(text)) {
    const c = viewportCenter();
    addImage(c.x, c.y, text);
    fadeEmptyHints();
  }
});

// --- Yjs → canvas wiring ------------------------------------------------------

initObjects(onPostRender);
initDraw(fadeEmptyHints);

// Remote (and undo/redo) edits to strokes / shapes repaint the canvas.
yStrokes.observe(requestRender);
yShapes.observe(requestRender);
// First edit of any kind clears the empty-room hints.
doc.on('update', fadeEmptyHints);

window.addEventListener('resize', resize);
resize();
showEmptyHints();

// --- expose handlers referenced by inline markup in room.html ----------------

Object.assign(window, {
  enterRoom,
  skipName,
  copyLink,
  saveSnapshot,
  undo,
  clearAll,
  zoomIn,
  zoomOut,
  resetView,
  openImageModal,
  openVideoModal,
  openLinkModal,
  closeModal,
  addImageFromUrl,
  addVideoFromUrl,
  addLinkFromUrl,
});
