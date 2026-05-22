// Instant templates — seed an empty room with a starting layout so people get
// to value immediately. Offered in the name popup when you open a fresh room.

import { Y, yObjects, yShapes, yEdges, transact, genId } from './sync';
import { STICKY_PALETTE } from './colors';
import { requestRender } from './canvas';
import { logEvent } from './log';

export const TEMPLATE_NAMES = ['Blank', 'Kanban', 'Mind map', 'Retro', 'Brainwrite'];

const EDGE_COLOR = '#8a8a90';
let zc = 0;
const z = (): number => ++zc;

// --- low-level placement (all called inside one transaction) -----------------

function placeText(x: number, y: number, content: string, color: string): void {
  const m = new Y.Map<unknown>();
  yObjects.set(genId(), m);
  m.set('type', 'text');
  m.set('x', x);
  m.set('y', y);
  m.set('color', color);
  m.set('z', z());
  m.set('text', new Y.Text(content));
}

function placeSticky(x: number, y: number, content: string, bg: string): string {
  const id = genId();
  const m = new Y.Map<unknown>();
  yObjects.set(id, m);
  m.set('type', 'sticky');
  m.set('x', x);
  m.set('y', y);
  m.set('bg', bg);
  m.set('rotation', (Math.random() - 0.5) * 5);
  m.set('z', z());
  m.set('text', new Y.Text(content));
  return id;
}

function placeFlow(x: number, y: number, content: string): string {
  const id = genId();
  const m = new Y.Map<unknown>();
  yObjects.set(id, m);
  m.set('type', 'flowcard');
  m.set('x', x);
  m.set('y', y);
  m.set('z', z());
  m.set('text', new Y.Text(content));
  return id;
}

function placeRect(x: number, y: number, w: number, h: number, color: string): void {
  const id = genId();
  yShapes.set(id, { id, type: 'rect', x, y, w, h, color, size: 2, z: z() });
}

function placeEdge(from: string, to: string): void {
  const id = genId();
  yEdges.set(id, { id, from, to, color: EDGE_COLOR });
}

// --- template layouts --------------------------------------------------------

/** Three labelled columns — shared by Kanban and Retro. */
function columnsLayout(cols: Array<{ title: string; color: string }>, sample: string): void {
  const colW = 300;
  const gap = 46;
  const startX = 120;
  cols.forEach((col, i) => {
    const x = startX + i * (colW + gap);
    placeText(x + 6, 52, col.title, col.color);
    placeRect(x, 96, colW, 470, col.color);
  });
  placeSticky(startX + 60, 132, sample, STICKY_PALETTE[0]!);
}

function seedKanban(): void {
  columnsLayout(
    [
      { title: 'To do', color: '#3a8fff' },
      { title: 'In progress', color: '#ffb02e' },
      { title: 'Done', color: '#6dbf8a' },
    ],
    'A task. Drag me to a column - double-click to edit.',
  );
}

function seedRetro(): void {
  columnsLayout(
    [
      { title: 'What went well', color: '#6dbf8a' },
      { title: 'What to improve', color: '#f95d50' },
      { title: 'Action items', color: '#3a8fff' },
    ],
    'Add a note for each thought from the sprint.',
  );
}

function seedMindMap(): void {
  const cx = 560;
  const cy = 330;
  const radius = 220;
  const hub = placeFlow(cx - 70, cy - 30, 'Central idea');
  const n = 5;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    const child = placeFlow(
      cx + Math.cos(ang) * radius - 70,
      cy + Math.sin(ang) * radius - 30,
      'Idea',
    );
    placeEdge(hub, child);
  }
}

function seedBrainwrite(): void {
  placeText(120, 52, 'Brainwrite - one idea per note, add as many as you like.', '#f95d50');
  const size = 180;
  const gap = 28;
  let k = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      placeSticky(
        120 + col * (size + gap),
        96 + row * (size + gap),
        '',
        STICKY_PALETTE[k % STICKY_PALETTE.length]!,
      );
      k++;
    }
  }
}

const SEEDS: Record<string, () => void> = {
  Kanban: seedKanban,
  'Mind map': seedMindMap,
  Retro: seedRetro,
  Brainwrite: seedBrainwrite,
};

/** Seed the room with a named template. No-op for 'Blank' or an unknown name. */
export function seedTemplate(name: string): void {
  const seed = SEEDS[name];
  if (!seed) return;
  zc = 0;
  transact(() => seed());
  requestRender();
  logEvent(`started from the ${name} template`);
}
